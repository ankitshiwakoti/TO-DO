// Import Firebase configuration
// import { firebaseConfig } from './firebaseConfig.js'; 

// Initialize Firebase
// firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Add a task to Firestore
document.getElementById('add-task').addEventListener('click', async () => {
    const taskInput = document.getElementById('new-task').value.trim();
    
    if (taskInput !== "") {
        try {
            await db.collection('tasks').add({
                task: taskInput,
                completed: false
            });
            console.log("Task added!");
            loadTasks();  // Reload tasks
        } catch (error) {
            console.error("Error adding task: ", error);
        }
    }
});

// Fetch tasks from Firestore and display them
async function loadTasks() {
    const taskList = document.getElementById('task-list');
    taskList.innerHTML = '';  // Clear the task list before reloading

    const querySnapshot = await db.collection('tasks').get();
    querySnapshot.forEach((doc) => {
        const taskData = doc.data();
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
            await db.collection('tasks').doc(doc.id).update({
                completed: !taskData.completed
            });
            loadTasks();  // Reload the tasks
        });

        // Delete task
        newTask.querySelector('.delete-btn').addEventListener('click', async () => {
            await db.collection('tasks').doc(doc.id).delete();
            loadTasks();  // Reload the tasks
        });

        if (taskData.completed) {
            newTask.classList.add('completed');
        }

        taskList.appendChild(newTask);
    });
}

// Load tasks on page load
window.onload = loadTasks;
