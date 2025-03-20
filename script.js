// Firebase setup
const db = firebase.firestore();

// Enable offline persistence for Firestore
firebase.firestore().enablePersistence({ experimentalForceOwningTab: true })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.log("Offline persistence failed: multiple tabs open");
    } else if (err.code === 'unimplemented') {
      console.log("Offline persistence is not supported in this browser");
    }
  });

// IndexedDB setup
const idb = indexedDB.open('todo-db', 1);
let idbStore;

idb.onupgradeneeded = (event) => {
  const db = event.target.result;

  // Create tasks store
  if (!db.objectStoreNames.contains('tasks')) {
    const store = db.createObjectStore('tasks', { keyPath: 'id' });
    store.createIndex('task', 'task', { unique: false });
    store.createIndex('timestamp', 'timestamp', { unique: false });
    console.log("Created 'tasks' object store in IndexedDB");
  }

  // Create sync store for tracking sync status
  if (!db.objectStoreNames.contains('sync')) {
    db.createObjectStore('sync', { keyPath: 'id' });
    console.log("Created 'sync' object store in IndexedDB");
  }
};

idb.onsuccess = (event) => {
  idbStore = event.target.result;
  console.log("IndexedDB opened successfully.");
  loadTasks();
};

idb.onerror = (event) => {
  console.error('Error opening IndexedDB:', event.target.error);
};

// Add task with offline support
document.getElementById('add-task').addEventListener('click', async () => {
  const taskInput = document.getElementById('new-task').value.trim();

  if (taskInput !== "") {
    const task = {
      id: Date.now().toString(), // Unique ID for offline tracking
      task: taskInput,
      completed: false,
      timestamp: Date.now(),
      syncStatus: 'pending'
    };

    try {
      // Always store in IndexedDB first
      const tx = idbStore.transaction(['tasks'], 'readwrite');
      const store = tx.objectStore('tasks');
      await store.add(task);

      // If online, sync to Firebase
      if (navigator.onLine) {
        await syncToFirebase(task);
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
    await db.collection('tasks').doc(task.id).set({
      task: task.task,
      completed: task.completed,
      timestamp: task.timestamp
    });
    
    // Update sync status in IndexedDB
    const tx = idbStore.transaction(['sync'], 'readwrite');
    const store = tx.objectStore('sync');
    await store.put({ id: task.id, status: 'synced' });
  } catch (error) {
    console.error("Error syncing to Firebase: ", error);
  }
}

// Load tasks with offline support
async function loadTasks() {
  const taskList = document.getElementById('task-list');
  taskList.innerHTML = '';

  try {
    // Get all tasks from IndexedDB
    const tx = idbStore.transaction(['tasks'], 'readonly');
    const store = tx.objectStore('tasks');
    const tasks = await store.getAll();

    // Sort tasks by timestamp
    tasks.sort((a, b) => b.timestamp - a.timestamp);

    // Display tasks
    tasks.forEach((task) => {
      displayTask(task);
    });

    // If online, sync with Firebase
    if (navigator.onLine) {
      syncWithFirebase();
    }
  } catch (error) {
    console.error("Error loading tasks: ", error);
  }
}

// Sync with Firebase
async function syncWithFirebase() {
  try {
    // Get all tasks from IndexedDB
    const tx = idbStore.transaction(['tasks'], 'readonly');
    const store = tx.objectStore('tasks');
    const tasks = await store.getAll();

    // Get sync status
    const syncTx = idbStore.transaction(['sync'], 'readonly');
    const syncStore = syncTx.objectStore('sync');
    const syncStatus = await syncStore.getAll();

    // Sync pending tasks to Firebase
    for (const task of tasks) {
      const isSynced = syncStatus.some(s => s.id === task.id && s.status === 'synced');
      if (!isSynced) {
        await syncToFirebase(task);
      }
    }

    // Get Firebase tasks and update IndexedDB
    const querySnapshot = await db.collection('tasks').get();
    querySnapshot.forEach((doc) => {
      const firebaseTask = doc.data();
      const tx = idbStore.transaction(['tasks'], 'readwrite');
      const store = tx.objectStore('tasks');
      store.put({
        id: doc.id,
        ...firebaseTask,
        syncStatus: 'synced'
      });
    });

    loadTasks(); // Reload tasks after sync
  } catch (error) {
    console.error("Error syncing with Firebase: ", error);
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
