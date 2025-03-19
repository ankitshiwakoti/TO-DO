// // Import Firebase configuration
// // import { firebaseConfig } from './firebaseConfig.js'; 

// // Initialize Firebase
// // firebase.initializeApp(firebaseConfig);
// const db = firebase.firestore();

// // Add a task to Firestore
// document.getElementById('add-task').addEventListener('click', async () => {
//     const taskInput = document.getElementById('new-task').value.trim();
    
//     if (taskInput !== "") {
//         try {
//             await db.collection('tasks').add({
//                 task: taskInput,
//                 completed: false
//             });
//             console.log("Task added!");
//             loadTasks();  // Reload tasks
//         } catch (error) {
//             console.error("Error adding task: ", error);
//         }
//     }
// });

// // Fetch tasks from Firestore and display them
// async function loadTasks() {
//     const taskList = document.getElementById('task-list');
//     taskList.innerHTML = '';  // Clear the task list before reloading

//     const querySnapshot = await db.collection('tasks').get();
//     querySnapshot.forEach((doc) => {
//         const taskData = doc.data();
//         const newTask = document.createElement('li');
//         newTask.innerHTML = `
//             <span>${taskData.task}</span>
//             <div class="task-buttons">
//                 <button class="complete-btn">&#x2713;</button>
//                 <button class="delete-btn">&#x2715;</button>
//             </div>
//         `;

//         // Mark task as completed
//         newTask.querySelector('.complete-btn').addEventListener('click', async () => {
//             await db.collection('tasks').doc(doc.id).update({
//                 completed: !taskData.completed
//             });
//             loadTasks();  // Reload the tasks
//         });

//         // Delete task
//         newTask.querySelector('.delete-btn').addEventListener('click', async () => {
//             await db.collection('tasks').doc(doc.id).delete();
//             loadTasks();  // Reload the tasks
//         });

//         if (taskData.completed) {
//             newTask.classList.add('completed');
//         }

//         taskList.appendChild(newTask);
//     });
// }

// // Load tasks on page load
// window.onload = loadTasks;

const db = firebase.firestore();

// Use IndexedDB for offline data storage
const idb = indexedDB.open('todo-db', 1);
let idbStore;

idb.onsuccess = (event) => {
  idbStore = event.target.result;
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
      // Store task in IndexedDB if offline
      if (!navigator.onLine) {
        const tx = idbStore.transaction(['tasks'], 'readwrite');
        const store = tx.objectStore('tasks');
        store.add(task);
      } else {
        // Sync to Firebase immediately if online
        await db.collection('tasks').add(task);
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
window.addEventListener('online', () => {
  const tx = idbStore.transaction(['tasks'], 'readonly');
  const store = tx.objectStore('tasks');
  store.getAll().onsuccess = async (event) => {
    const tasks = event.target.result;
    tasks.forEach(async (task) => {
      if (task.addedOffline) {
        await db.collection('tasks').add(task); // Sync to Firebase
      }
    });

    // Clear tasks from IndexedDB after sync
    const clearTx = idbStore.transaction(['tasks'], 'readwrite');
    const clearStore = clearTx.objectStore('tasks');
    clearStore.clear();
  };
});

// Load tasks when the page loads
window.onload = loadTasks;
