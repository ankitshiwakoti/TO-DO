// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded');
  
  // Global variables
  let idbStore;
  let firestoreDb;
  const dbVersion = 1;
  const taskList = document.getElementById('taskList');
  const taskInput = document.getElementById('taskInput');

  // Initialize Firebase if not already initialized
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

        // Create tasks store if it doesn't exist
        if (!db.objectStoreNames.contains('tasks')) {
          const store = db.createObjectStore('tasks', { keyPath: 'id' });
          store.createIndex('task', 'task', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          console.log("Created 'tasks' object store");
        }

        // Create sync store if it doesn't exist
        if (!db.objectStoreNames.contains('sync')) {
          db.createObjectStore('sync', { keyPath: 'id' });
          console.log("Created 'sync' object store");
        }
      };
    });
  }

  // Function to initialize Firebase
  async function initFirebase() {
    try {
      // Enable offline persistence
      await firebase.firestore().enablePersistence()
        .catch((err) => {
          if (err.code == 'failed-precondition') {
            console.error('Multiple tabs open, persistence can only be enabled in one tab at a time.');
          } else if (err.code == 'unimplemented') {
            console.error('The current browser does not support offline persistence');
          }
        });
      console.log('Offline persistence enabled successfully');

      // Initialize Firestore
      firestoreDb = firebase.firestore();
      console.log('Firestore instance created');

      // Check connection and get initial data
      const tasksRef = firestoreDb.collection('tasks');
      const snapshot = await tasksRef.get();
      console.log('Firebase connection successful');
      console.log('Number of tasks in Firebase:', snapshot.size);

      // Store tasks in IndexedDB
      const tx = idbStore.transaction(['tasks'], 'readwrite');
      const store = tx.objectStore('tasks');

      snapshot.forEach(doc => {
        const task = doc.data();
        task.id = doc.id;
        console.log('Firebase task:', doc.id, task);
        store.put(task);
      });

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });

      console.log('All Firebase tasks stored in IndexedDB');
      return firestoreDb;
    } catch (error) {
      console.error('Error initializing Firebase:', error);
      throw error;
    }
  }

  // Function to add a task
  async function addTask() {
    if (!taskInput || !taskInput.value.trim()) return;

    const task = {
      id: Date.now().toString(),
      task: taskInput.value.trim(),
      completed: false,
      timestamp: Date.now(),
      syncStatus: 'pending'
    };

    try {
      // Add to IndexedDB
      const tx = idbStore.transaction(['tasks'], 'readwrite');
      const store = tx.objectStore('tasks');
      await store.add(task);

      // Add to Firebase if online
      if (navigator.onLine) {
        await firestoreDb.collection('tasks').doc(task.id).set({
          task: task.task,
          completed: task.completed,
          timestamp: task.timestamp
        });
        task.syncStatus = 'synced';
        await store.put(task);
      }

      // Clear input and reload tasks
      taskInput.value = '';
      await loadTasks();
    } catch (error) {
      console.error('Error adding task:', error);
    }
  }

  // Function to toggle task completion
  async function toggleTask(taskId) {
    try {
      const tx = idbStore.transaction(['tasks'], 'readwrite');
      const store = tx.objectStore('tasks');
      const task = await store.get(taskId);
      
      if (task) {
        task.completed = !task.completed;
        task.syncStatus = 'pending';
        await store.put(task);

        if (navigator.onLine) {
          await firestoreDb.collection('tasks').doc(taskId).update({
            completed: task.completed
          });
          task.syncStatus = 'synced';
          await store.put(task);
        }

        await loadTasks();
      }
    } catch (error) {
      console.error('Error toggling task:', error);
    }
  }

  // Function to delete a task
  async function deleteTask(taskId) {
    try {
      const tx = idbStore.transaction(['tasks'], 'readwrite');
      const store = tx.objectStore('tasks');
      await store.delete(taskId);

      if (navigator.onLine) {
        await firestoreDb.collection('tasks').doc(taskId).delete();
      }

      await loadTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  }

  // Function to load tasks
  async function loadTasks() {
    console.log('Loading tasks...');
    if (!taskList) {
      console.error('Task list element not found!');
      return;
    }

    try {
      const tx = idbStore.transaction(['tasks'], 'readonly');
      const store = tx.objectStore('tasks');
      const tasks = await store.getAll();

      // Sort tasks by timestamp
      tasks.sort((a, b) => b.timestamp - a.timestamp);

      // Clear existing tasks
      taskList.innerHTML = '';

      // Add tasks to the list
      tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = task.completed ? 'completed' : '';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-checkbox';
        checkbox.checked = task.completed;
        checkbox.addEventListener('change', () => toggleTask(task.id));

        const taskText = document.createElement('span');
        taskText.className = 'task-text';
        taskText.textContent = task.task;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteTask(task.id));

        li.appendChild(checkbox);
        li.appendChild(taskText);
        li.appendChild(deleteBtn);
        taskList.appendChild(li);
      });
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
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
      if (taskList) {
        taskList.innerHTML = '<li class="error">Error loading tasks. Please refresh the page.</li>';
      }
    });

  // Add event listener for the add task button
  const addButton = document.querySelector('button');
  if (addButton) {
    addButton.addEventListener('click', addTask);
  }

  // Add event listener for the input field (Enter key)
  if (taskInput) {
    taskInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addTask();
      }
    });
  }

  // Online/Offline event handlers
  window.addEventListener('online', async () => {
    console.log('Back online, syncing tasks...');
    const tx = idbStore.transaction(['tasks'], 'readonly');
    const store = tx.objectStore('tasks');
    const tasks = await store.getAll();
    
    for (const task of tasks) {
      if (task.syncStatus === 'pending') {
        try {
          await firestoreDb.collection('tasks').doc(task.id).set({
            task: task.task,
            completed: task.completed,
            timestamp: task.timestamp
          });
          
          const updateTx = idbStore.transaction(['tasks'], 'readwrite');
          const updateStore = updateTx.objectStore('tasks');
          task.syncStatus = 'synced';
          await updateStore.put(task);
        } catch (error) {
          console.error('Error syncing task:', error);
        }
      }
    }
  });

  window.addEventListener('offline', () => {
    console.log('App is offline, changes will be synced when back online');
  });
});
