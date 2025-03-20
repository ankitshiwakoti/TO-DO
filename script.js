// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded');
  
  // Check if Firebase is initialized
  if (!firebase.apps.length) {
    console.error('Firebase is not initialized!');
    return;
  }
  console.log('Firebase is initialized successfully');

  // Firebase setup
  const db = firebase.firestore();
  console.log('Firestore instance created');

  // Enable offline persistence for Firestore BEFORE any other Firestore operations
  firebase.firestore().enablePersistence({ experimentalForceOwningTab: true })
    .then(() => {
      console.log('Offline persistence enabled successfully');
      // Only test Firebase connection after persistence is enabled
      return db.collection('tasks').get();
    })
    .then(snapshot => {
      console.log('Firebase connection successful');
      console.log('Number of tasks in Firebase:', snapshot.size);
      snapshot.forEach(doc => {
        console.log('Firebase task:', doc.id, doc.data());
        // Store Firebase tasks in IndexedDB
        const task = {
          id: doc.id,
          ...doc.data(),
          syncStatus: 'synced'
        };
        // Store in IndexedDB
        const tx = idbStore.transaction(['tasks'], 'readwrite');
        const store = tx.objectStore('tasks');
        store.put(task);
      });
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.log("Offline persistence failed: multiple tabs open");
      } else if (err.code === 'unimplemented') {
        console.log("Offline persistence is not supported in this browser");
      }
      console.error('Firebase error:', err);
    });

  // IndexedDB setup
  let idbStore;
  let dbVersion = 1;
  
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
        console.log('Available stores:', idbStore.objectStoreNames);
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

  // Initialize IndexedDB and start the app
  initIndexedDB()
    .then(() => {
      console.log('IndexedDB initialization complete');
      // Verify stores exist
      if (idbStore.objectStoreNames.contains('tasks') && idbStore.objectStoreNames.contains('sync')) {
        console.log('IndexedDB stores verified');
        loadTasks();
      } else {
        console.error('Required IndexedDB stores not found. Available stores:', idbStore.objectStoreNames);
      }
    })
    .catch(error => {
      console.error('Failed to initialize IndexedDB:', error);
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
        const tx = idbStore.transaction(['tasks'], 'readwrite');
        const store = tx.objectStore('tasks');
        await store.add(task);
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
      }
    }
  });

  // Sync task to Firebase
  async function syncToFirebase(task) {
    try {
      console.log('Syncing task to Firebase:', task);
      await db.collection('tasks').doc(task.id).set({
        task: task.task,
        completed: task.completed,
        timestamp: task.timestamp
      });
      console.log('Task synced to Firebase successfully');
      
      // Update sync status in IndexedDB
      const tx = idbStore.transaction(['sync'], 'readwrite');
      const store = tx.objectStore('sync');
      await store.put({ id: task.id, status: 'synced' });
      console.log('Sync status updated in IndexedDB');
    } catch (error) {
      console.error("Error syncing to Firebase: ", error);
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
      const tx = idbStore.transaction(['tasks'], 'readonly');
      const store = tx.objectStore('tasks');
      const tasks = await store.getAll();
      console.log('Tasks loaded from IndexedDB:', tasks);

      // Sort tasks by timestamp
      tasks.sort((a, b) => b.timestamp - a.timestamp);

      // Display tasks
      tasks.forEach((task) => {
        displayTask(task);
      });
    } catch (error) {
      console.error("Error loading tasks: ", error);
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
        const tx = idbStore.transaction(['tasks'], 'readwrite');
        const store = tx.objectStore('tasks');
        taskData.completed = !taskData.completed;
        await store.put(taskData);

        // If online, sync to Firebase
        if (navigator.onLine) {
          await db.collection('tasks').doc(taskData.id).update({
            completed: taskData.completed
          });
        }

        loadTasks();
      } catch (error) {
        console.error("Error updating task: ", error);
      }
    });

    // Delete task
    newTask.querySelector('.delete-btn').addEventListener('click', async () => {
      try {
        // Delete from IndexedDB
        const tx = idbStore.transaction(['tasks'], 'readwrite');
        const store = tx.objectStore('tasks');
        await store.delete(taskData.id);

        // If online, delete from Firebase
        if (navigator.onLine) {
          await db.collection('tasks').doc(taskData.id).delete();
        }

        loadTasks();
      } catch (error) {
        console.error("Error deleting task: ", error);
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
