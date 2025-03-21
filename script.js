// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded');
  
  // Global variables
  let idbStore;
  let firestoreDb;
  let dbVersion = 1;
  
  // Check if Firebase is initialized
  if (!firebase.apps.length) {
    console.error('Firebase is not initialized!');
    return;
  }
  console.log('Firebase is initialized successfully');

  // Function to initialize IndexedDB
  function initIndexedDB() {
    return new Promise((resolve, reject) => {
      console.log('Opening IndexedDB...');
      
      const request = indexedDB.open('todo-db', dbVersion);

      request.onerror = (event) => {
        console.error('Error opening IndexedDB:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        idbStore = event.target.result;
        console.log("IndexedDB opened successfully.");
        console.log('Available stores:', Array.from(idbStore.objectStoreNames));
        resolve(idbStore);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('Upgrading IndexedDB...');

        // Create tasks store
        if (!db.objectStoreNames.contains('tasks')) {
          const store = db.createObjectStore('tasks', { keyPath: 'id' });
          store.createIndex('task', 'task', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          console.log("Created 'tasks' object store in IndexedDB");
        }

        // Create sync store
        if (!db.objectStoreNames.contains('sync')) {
          db.createObjectStore('sync', { keyPath: 'id' });
          console.log("Created 'sync' object store in IndexedDB");
        }
      };
    });
  }

  // Function to initialize Firebase
  async function initFirebase() {
    try {
      // Enable persistence first
      await firebase.firestore().enablePersistence({ experimentalForceOwningTab: true });
      console.log('Offline persistence enabled successfully');

      // Then create Firestore instance
      firestoreDb = firebase.firestore();
      console.log('Firestore instance created');

      // Test connection and load tasks
      const snapshot = await firestoreDb.collection('tasks').get();
      console.log('Firebase connection successful');
      console.log('Number of tasks in Firebase:', snapshot.size);

      // Store Firebase tasks in IndexedDB
      const tasks = [];
      snapshot.forEach(doc => {
        console.log('Firebase task:', doc.id, doc.data());
        const task = {
          id: doc.id,
          ...doc.data(),
          syncStatus: 'synced'
        };
        tasks.push(task);
      });

      // Store all tasks in IndexedDB in a single transaction
      if (tasks.length > 0) {
        await handleIndexedDBTransaction('tasks', 'readwrite', async (store) => {
          await Promise.all(tasks.map(task => store.put(task)));
        });
        console.log('All Firebase tasks stored in IndexedDB');
      }

      return firestoreDb;
    } catch (err) {
      if (err.code === 'failed-precondition') {
        console.log("Offline persistence failed: multiple tabs open");
      } else if (err.code === 'unimplemented') {
        console.log("Offline persistence is not supported in this browser");
      }
      console.error('Firebase initialization error:', err);
      throw err;
    }
  }

  // Function to handle IndexedDB transaction
  async function handleIndexedDBTransaction(storeName, mode, callback) {
    return new Promise((resolve, reject) => {
      if (!idbStore) {
        reject(new Error('IndexedDB not initialized'));
        return;
      }

      const tx = idbStore.transaction([storeName], mode);
      const store = tx.objectStore(storeName);
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      
      callback(store);
    });
  }

  // Initialize both IndexedDB and Firebase
  initIndexedDB()
    .then(() => {
      console.log('IndexedDB initialization complete');
      return initFirebase();
    })
    .then(() => {
      // Initialize app with both IndexedDB and Firebase ready
      loadTasks();
    })
    .catch(error => {
      console.error('Initialization error:', error);
      // Show error to user
      const taskList = document.getElementById('task-list');
      taskList.innerHTML = '<li class="error">Error loading tasks. Please refresh the page.</li>';
    });

  // Add task with offline support
  document.getElementById('add-task').addEventListener('click', async () => {
    const taskInput = document.getElementById('new-task').value.trim();
    console.log('Adding new task:', taskInput);

    if (taskInput !== "") {
      const task = {
        id: Date.now().toString(), // Unique ID for offline tracking
        task: taskInput,
        completed: false,
        timestamp: Date.now(),
        syncStatus: 'pending'
      };

      try {
        console.log('Attempting to add task to IndexedDB:', task);
        // Verify stores exist before proceeding
        if (!idbStore.objectStoreNames.contains('tasks')) {
          throw new Error('Tasks store not found');
        }

        // Always store in IndexedDB first
        await handleIndexedDBTransaction('tasks', 'readwrite', async (store) => {
          await store.add(task);
        });
        console.log('Task added to IndexedDB successfully');

        // If online, sync to Firebase
        if (navigator.onLine) {
          console.log('Online - syncing to Firebase');
          await syncToFirebase(task);
        } else {
          console.log('Offline - task will sync when online');
        }

        document.getElementById('new-task').value = '';
        loadTasks();
      } catch (error) {
        console.error("Error adding task: ", error);
        alert('Error adding task. Please try again.');
      }
    }
  });

  // Sync task to Firebase
  async function syncToFirebase(task) {
    try {
      console.log('Syncing task to Firebase:', task);
      await firestoreDb.collection('tasks').doc(task.id).set({
        task: task.task,
        completed: task.completed,
        timestamp: task.timestamp
      });
      console.log('Task synced to Firebase successfully');
      
      // Update sync status in IndexedDB
      await handleIndexedDBTransaction('sync', 'readwrite', async (store) => {
        await store.put({ id: task.id, status: 'synced' });
      });
      console.log('Sync status updated in IndexedDB');
    } catch (error) {
      console.error("Error syncing to Firebase: ", error);
      throw error;
    }
  }

  // Sync all pending tasks with Firebase
  async function syncWithFirebase() {
    try {
      console.log('Starting Firebase sync...');
      
      // Get all tasks from IndexedDB
      const tasks = await new Promise((resolve, reject) => {
        const tx = idbStore.transaction(['tasks'], 'readonly');
        const store = tx.objectStore('tasks');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Get sync status
      const syncStatus = await new Promise((resolve, reject) => {
        const tx = idbStore.transaction(['sync'], 'readonly');
        const store = tx.objectStore('sync');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Sync pending tasks to Firebase
      for (const task of tasks) {
        const isSynced = syncStatus.some(s => s.id === task.id && s.status === 'synced');
        if (!isSynced) {
          await syncToFirebase(task);
        }
      }

      // Get Firebase tasks and update IndexedDB
      const snapshot = await firestoreDb.collection('tasks').get();
      const firebaseTasks = [];
      snapshot.forEach((doc) => {
        firebaseTasks.push({
          id: doc.id,
          ...doc.data(),
          syncStatus: 'synced'
        });
      });

      // Update IndexedDB with Firebase tasks
      await handleIndexedDBTransaction('tasks', 'readwrite', async (store) => {
        await Promise.all(firebaseTasks.map(task => store.put(task)));
      });

      loadTasks(); // Reload tasks after sync
    } catch (error) {
      console.error("Error syncing with Firebase: ", error);
    }
  }

  // Load tasks with offline support
  async function loadTasks() {
    console.log('Loading tasks...');
    const taskList = document.getElementById('task-list');
    taskList.innerHTML = '';

    try {
      // Verify stores exist before proceeding
      if (!idbStore.objectStoreNames.contains('tasks')) {
        throw new Error('Tasks store not found');
      }

      // Get all tasks from IndexedDB
      const tasks = await new Promise((resolve, reject) => {
        const tx = idbStore.transaction(['tasks'], 'readonly');
        const store = tx.objectStore('tasks');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      console.log('Tasks loaded from IndexedDB:', tasks);

      // Sort tasks by timestamp
      tasks.sort((a, b) => b.timestamp - a.timestamp);

      // Display tasks
      tasks.forEach((task) => {
        displayTask(task);
      });
    } catch (error) {
      console.error("Error loading tasks: ", error);
      taskList.innerHTML = '<li class="error">Error loading tasks. Please try again.</li>';
    }
  }

  // Display task on UI
  function displayTask(taskData) {
    const taskList = document.getElementById('task-list');
    const newTask = document.createElement('li');
    newTask.innerHTML = `
      <span>${taskData.task}</span>
      <div class="task-buttons">
        <button class="complete-btn">&#x2713;</button>
        <button class="delete-btn">&#x2715;</button>
      </div>
    `;

    // Mark task as completed
    newTask.querySelector('.complete-btn').addEventListener('click', async () => {
      try {
        // Update in IndexedDB
        await handleIndexedDBTransaction('tasks', 'readwrite', async (store) => {
          taskData.completed = !taskData.completed;
          await store.put(taskData);
        });

        // If online, sync to Firebase
        if (navigator.onLine) {
          await firestoreDb.collection('tasks').doc(taskData.id).update({
            completed: taskData.completed
          });
        }

        loadTasks();
      } catch (error) {
        console.error("Error updating task: ", error);
        alert('Error updating task. Please try again.');
      }
    });

    // Delete task
    newTask.querySelector('.delete-btn').addEventListener('click', async () => {
      try {
        // Delete from IndexedDB
        await handleIndexedDBTransaction('tasks', 'readwrite', async (store) => {
          await store.delete(taskData.id);
        });

        // If online, delete from Firebase
        if (navigator.onLine) {
          await firestoreDb.collection('tasks').doc(taskData.id).delete();
        }

        loadTasks();
      } catch (error) {
        console.error("Error deleting task: ", error);
        alert('Error deleting task. Please try again.');
      }
    });

    if (taskData.completed) {
      newTask.classList.add('completed');
    }

    taskList.appendChild(newTask);
  }

  // Handle online/offline events
  window.addEventListener('online', () => {
    console.log("You are back online!");
    syncWithFirebase();
  });

  window.addEventListener('offline', () => {
    console.log("You are offline. Changes will be synced when you're back online.");
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('ServiceWorker registration successful');
        })
        .catch(err => {
          console.log('ServiceWorker registration failed: ', err);
        });
    });
  }
});
