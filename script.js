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
  if (!db.objectStoreNames.contains('tasks')) {
    const store = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
    store.createIndex('task', 'task', { unique: false });
  }
};

idb.onsuccess = (event) => {
  idbStore = event.target.result;
  console.log("IndexedDB opened successfully.");
};

idb.onerror = (event) => {
  console.error('Error opening IndexedDB:', event.target.error);
};

// Add task and store in IndexedDB
document.getElementById('add-task').addEventListener('click', async () => {
  const taskInput = document.getElementById('new-task').value.trim();

  if (taskInput !== "") {
    const task = {
      task: taskInput,
      completed: false,
      addedOffline: true, // Flag to indicate it was added offline
    };

    try {
      if (!navigator.onLine) {
        // Store task in IndexedDB if offline
        const tx = idbStore.transaction(['tasks'], 'readwrite');
        const store = tx.objectStore('tasks');
        store.add(task);
        console.log("Task added to IndexedDB while offline");
      } else {
        // Sync to Firebase immediately if online
        await db.collection('tasks').add(task);
        console.log("Task added to Firebase");
      }

      loadTasks(); // Reload tasks
    } catch (error) {
      console.error("Error adding task: ", error);
    }
  }
});

// Load tasks from Firebase or IndexedDB
async function loadTasks() {
  const taskList = document.getElementById('task-list');
  taskList.innerHTML = ''; // Clear the task list

  // If online, load from Firebase
  if (navigator.onLine) {
    const querySnapshot = await db.collection('tasks').get();
    querySnapshot.forEach((doc) => {
      const taskData = doc.data();
      displayTask(taskData, doc.id);
    });
  } else {
    // If offline, load from IndexedDB
    const tx = idbStore.transaction(['tasks'], 'readonly');
    const store = tx.objectStore('tasks');
    const allTasks = await store.getAll();
    
    allTasks.forEach((task) => {
      displayTask(task);
    });
  }
}

// Display task on UI
function displayTask(taskData, taskId) {
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
    await db.collection('tasks').doc(taskId).update({
      completed: !taskData.completed,
    });
    loadTasks(); // Reload the tasks
  });

  // Delete task
  newTask.querySelector('.delete-btn').addEventListener('click', async () => {
    await db.collection('tasks').doc(taskId).delete();
    loadTasks(); // Reload the tasks
  });

  if (taskData.completed) {
    newTask.classList.add('completed');
  }

  taskList.appendChild(newTask);
}

// Sync offline tasks when back online
async function syncOfflineTasks() {
  const tx = idbStore.transaction(['tasks'], 'readonly');
  const store = tx.objectStore('tasks');
  store.getAll().onsuccess = async (event) => {
    const tasks = event.target.result;
    tasks.forEach(async (task) => {
      if (task.addedOffline) {
        await db.collection('tasks').add(task); // Sync to Firebase
        console.log("Task synced to Firebase");
      }
    });

    // Clear tasks from IndexedDB after sync
    const clearTx = idbStore.transaction(['tasks'], 'readwrite');
    const clearStore = clearTx.objectStore('tasks');
    clearStore.clear();
    console.log("IndexedDB cleared after syncing");
  };
}

// Listen for when the user goes online
window.addEventListener('online', () => {
  console.log("You are back online!");
  syncOfflineTasks(); // Sync tasks when online
});

// Load tasks when the page loads
window.onload = loadTasks;
