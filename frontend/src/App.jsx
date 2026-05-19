import { useState, useEffect } from 'react'

function App() {
  const [tasks, setTasks] = useState([])
  const [newTaskTitle, setNewTaskTitle] = useState("")

  // 1. Fetch Initial Data
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const response = await fetch('http://127.0.0.1:5000/tasks')
        const data = await response.json()
        setTasks(data.tasks ? data.tasks : (Array.isArray(data) ? data : []))
      } catch (error) {
        console.error("Error fetching tasks:", error)
      }
    }
    fetchTasks()
  }, [])

  // 2. Add a Task (POST)
  const handleAddTask = async (e) => {
    e.preventDefault()
    if (newTaskTitle.trim() === "") return 

    try {
      const response = await fetch('http://127.0.0.1:5000/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTaskTitle })
      })
      const newlyCreatedTask = await response.json()
      
      // Update memory: Copy old tasks, add the new one
      setTasks([...tasks, newlyCreatedTask])
      setNewTaskTitle("")
    } catch (error) {
      console.error("Error adding task:", error)
    }
  }

  // 3. Toggle 'Done' Status (PUT)
  const handleToggleDone = async (task) => {
    try {
      const response = await fetch(`http://127.0.0.1:5000/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Send the OPPOSITE of the current status
        body: JSON.stringify({ done: !task.done }) 
      })
      const updatedTask = await response.json()

      // Update memory: Use .map() to find the right task and swap it
      setTasks(tasks.map(t => t.id === task.id ? updatedTask : t))
    } catch (error) {
      console.error("Error toggling status:", error)
    }
  }

  // 4. Edit Title (PUT)
  const handleEditTitle = async (task) => {
    // Open a simple browser prompt to get the new name
    const newTitle = window.prompt("Edit task title:", task.title)
    
    // If they hit cancel, or typed nothing, do nothing
    if (!newTitle || newTitle.trim() === "" || newTitle === task.title) return

    try {
      const response = await fetch(`http://127.0.0.1:5000/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      })
      const updatedTask = await response.json()

      // Update memory exactly like we did for toggling status
      setTasks(tasks.map(t => t.id === task.id ? updatedTask : t))
    } catch (error) {
      console.error("Error updating title:", error)
    }
  }

  // 5. Delete a Task (DELETE)
  const handleDelete = async (id) => {
    try {
      // Notice the URL includes the specific ID!
      await fetch(`http://127.0.0.1:5000/tasks/${id}`, {
        method: 'DELETE'
      })

      // Update memory: Use .filter() to keep everything EXCEPT the deleted ID
      setTasks(tasks.filter(t => t.id !== id))
    } catch (error) {
      console.error("Error deleting task:", error)
    }
  }

  // 6. Paint the UI
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px' }}>
      <h1>Task Manager API Dashboard</h1>
      
      <form onSubmit={handleAddTask} style={{ marginBottom: '20px' }}>
        <input 
          type="text" 
          placeholder="Type a new task here..." 
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          style={{ padding: '8px', width: '70%', marginRight: '10px' }}
        />
        <button type="submit" style={{ padding: '8px 16px', cursor: 'pointer' }}>Add Task</button>
      </form>

      <h2>My Tasks:</h2>
      <ul style={{ listStyleType: 'none', padding: 0 }}>
        {tasks.map(task => (
          <li key={task.id} style={{ 
            marginBottom: '10px', 
            padding: '12px', 
            border: '1px solid #ccc',
            borderRadius: '5px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: task.done ? '#f0f8ff' : 'white'
          }}>
            
            {/* Left side: The Task Name */}
            <span 
              style={{ textDecoration: task.done ? 'line-through' : 'none', color: task.done ? 'gray' : 'black' }}
            >
              <strong>{task.title}</strong>
            </span>

            {/* Right side: The Action Buttons */}
            <div>
              <button 
                onClick={() => handleToggleDone(task)} 
                style={{ marginRight: '5px', cursor: 'pointer' }}
              >
                {task.done ? "Undo" : "Mark Done"}
              </button>
              
              <button 
                onClick={() => handleEditTitle(task)} 
                style={{ marginRight: '5px', cursor: 'pointer' }}
              >
                Edit
              </button>
              
              <button 
                onClick={() => handleDelete(task.id)} 
                style={{ cursor: 'pointer', backgroundColor: '#ff4d4d', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '3px' }}
              >
                Delete
              </button>
            </div>
            
          </li>
        ))}
      </ul>
      
      {tasks.length === 0 && <p>No tasks found. Add one above!</p>}
    </div>
  )
}

export default App