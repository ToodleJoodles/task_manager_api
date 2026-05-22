import { useState, useEffect } from 'react'

function App() {

  const [tasks, setTasks] = useState([])
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [token, setToken] = useState(localStorage.getItem("token") || null)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isLoginMode, setIsLoginMode] = useState(true) 
  const [authError, setAuthError] = useState("")
  const [role, setRole] = useState(localStorage.getItem("role") || null) 

  useEffect(() => {
    if (token) {
      loadTasksFromServer()
    }
  }, [token])

  async function handleAuthSubmit(event) {
    event.preventDefault()
    setAuthError("")
    const endpoint = isLoginMode ? '/login' : '/register'

    try {
      const response = await fetch(`http://127.0.0.1:5000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await response.json()

      if (!response.ok) {
        setAuthError(data.error || "Authentication failed")
        return
      }
      if (isLoginMode) {
        localStorage.setItem("token", data.access_token)
        localStorage.setItem("role", data.role) 
        setToken(data.access_token)
        setRole(data.role)                    
        setUsername("")
        setPassword("")
      }   

      else {
        alert("Registration successful! You can now log in.")
        setIsLoginMode(true)
        setPassword("")
      }
    } catch (error) {
      setAuthError("Network error. Is the Flask server running?")
    }
  }

  function handleLogout() {
    localStorage.removeItem("token")
    localStorage.removeItem("role")
    setToken(null)
    setRole(null)
    setTasks([])
  }

  async function loadTasksFromServer() {
    try {
      const response = await fetch('http://127.0.0.1:5000/tasks', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()

      if (data.tasks) {
        setTasks(data.tasks)
      } else if (Array.isArray(data)) {
        setTasks(data)
      } else {
        setTasks([])
      }
    } catch (error) {
      console.error("Error fetching tasks:", error)
    }
  }

  async function handleAddTask(event) {
    event.preventDefault()
    if (newTaskTitle.trim() === "") return

    try {
      const response = await fetch('http://127.0.0.1:5000/tasks', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ title: newTaskTitle })
      })
      const newlyCreatedTask = await response.json()
      setTasks([...tasks, newlyCreatedTask])
      setNewTaskTitle("")
    } catch (error) {
      console.error("Error adding task:", error)
    }
  }

  async function handleToggleDone(task) {
    const flippedDoneStatus = !task.done
    try {
      const response = await fetch(`http://127.0.0.1:5000/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ done: flippedDoneStatus })
      })
      const updatedTask = await response.json()
      setTasks(tasks.map(t => t.id === task.id ? updatedTask : t))
    } catch (error) {
      console.error("Error toggling task status:", error)
    }
  }

  async function handleEditTitle(task) {
    const newTitle = window.prompt("Edit task title:", task.title)
    if (!newTitle || newTitle.trim() === "" || newTitle === task.title) return

    try {
      const response = await fetch(`http://127.0.0.1:5000/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: newTitle })
      })
      const updatedTask = await response.json()
      setTasks(tasks.map(t => t.id === task.id ? updatedTask : t))
    } catch (error) {
      console.error("Error updating task title:", error)
    }
  }

  async function handleDelete(taskId) {
    try {
      await fetch(`http://127.0.0.1:5000/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      setTasks(tasks.filter(t => t.id !== taskId))
    } catch (error) {
      console.error("Error deleting task:", error)
    }
  }

  return (
    <div style={styles.pageBackground}>
      <div style={styles.contentColumn}>

        <header style={styles.header}>
          <div style={styles.headerAccent} />
          <h1 style={styles.heading}>Task Manager</h1>
          
          {token && (
            <button onClick={handleLogout} style={styles.logoutButton}>
              Log Out
            </button>
          )}
        </header>

        {!token ? (
          <div style={styles.card}>
            <p style={styles.sectionLabel}>{isLoginMode ? 'SECURE LOGIN' : 'CREATE ACCOUNT'}</p>
            
            {authError && <p style={styles.errorText}>{authError}</p>}
            
            <form onSubmit={handleAuthSubmit} style={styles.authForm}>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.input}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                required
              />
              <button type="submit" style={styles.addButton}>
                {isLoginMode ? 'Login to Dashboard' : 'Register Account'}
              </button>
            </form>

            <button 
              onClick={() => setIsLoginMode(!isLoginMode)} 
              style={styles.toggleModeButton}
            >
              {isLoginMode ? "Need an account? Register here." : "Already have an account? Log in."}
            </button>
          </div>
        ) : (
          <div>
            
            {role === 'admin' && (
              <div style={styles.card}>
                <p style={styles.sectionLabel}>ADD NEW TASK</p>
                <form onSubmit={handleAddTask} style={styles.form}>
                  <input
                    type="text"
                    placeholder="What needs to be done?"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    style={styles.input}
                  />
                  <button type="submit" style={styles.addButton}>
                    + Add Task
                  </button>
                </form>
              </div>
            )}

            <div style={styles.card}>
              <p style={styles.sectionLabel}>
                MY TASKS
                <span style={styles.taskCount}>{tasks.length}</span>
              </p>

              {tasks.length === 0 && (
                <p style={styles.emptyMessage}>No tasks yet.</p>
              )}

              <ul style={styles.taskList}>
                {tasks.map((task) => (
                  <li key={task.id} style={task.done ? styles.taskItemDone : styles.taskItemActive}>
                    <span style={task.done ? styles.taskTitleDone : styles.taskTitleActive}>
                      {task.title}
                    </span>
                    
                    <div style={styles.buttonGroup}>
                      <button onClick={() => handleToggleDone(task)} style={task.done ? styles.undoButton : styles.doneButton}>
                        {task.done ? "↩ Undo" : "✓ Done"}
                      </button>

                      {role === 'admin' && (
                        <>
                          <button onClick={() => handleEditTitle(task)} style={styles.editButton}>
                            ✎ Edit
                          </button>
                          <button onClick={() => handleDelete(task.id)} style={styles.deleteButton}>
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                    
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

const styles = {
  pageBackground: {
    minHeight: '100vh',
    width: '100%',
    backgroundColor: '#f5f4f0',
    fontFamily: "'Georgia', serif",
  },
  contentColumn: {
    maxWidth: '680px',
    margin: '0 auto',
    padding: '40px 20px',
  },
  header: {
    position: 'relative',
    marginBottom: '32px',
    paddingLeft: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerAccent: {
    position: 'absolute',
    left: 0,
    top: '4px',
    bottom: '4px',
    width: '4px',
    backgroundColor: '#c0392b',
    borderRadius: '2px',
  },
  heading: {
    margin: '0',
    fontSize: '2rem',
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: '-0.5px',
  },
  logoutButton: {
    padding: '6px 12px',
    fontSize: '0.8rem',
    fontFamily: "'Courier New', monospace",
    fontWeight: '700',
    backgroundColor: 'transparent',
    color: '#c0392b',
    border: '1.5px solid #c0392b',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    padding: '24px',
    marginBottom: '20px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
    border: '1px solid #ebebeb',
  },
  sectionLabel: {
    margin: '0 0 16px 0',
    fontSize: '0.72rem',
    fontFamily: "'Courier New', monospace",
    fontWeight: '700',
    letterSpacing: '1.5px',
    color: '#aaa',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  taskCount: {
    backgroundColor: '#f5f4f0',
    color: '#555',
    borderRadius: '20px',
    padding: '1px 9px',
    fontSize: '0.8rem',
    fontWeight: '600',
    fontFamily: "'Georgia', serif",
  },
  form: {
    display: 'flex',
    gap: '10px',
  },
  authForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  input: {
    flex: 1,
    padding: '10px 14px',
    fontSize: '0.95rem',
    border: '1.5px solid #ddd',
    borderRadius: '6px',
    outline: 'none',
    fontFamily: "'Georgia', serif",
    backgroundColor: '#fafafa',
    color: '#1a1a1a',
  },
  addButton: {
    padding: '10px 20px',
    fontSize: '0.9rem',
    fontWeight: '700',
    fontFamily: "'Courier New', monospace",
    letterSpacing: '0.5px',
    backgroundColor: '#c0392b',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  toggleModeButton: {
    marginTop: '16px',
    background: 'none',
    border: 'none',
    color: '#2980b9',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontFamily: "'Georgia', serif",
    fontSize: '0.9rem',
    padding: 0,
  },
  errorText: {
    color: '#c0392b',
    fontSize: '0.85rem',
    marginBottom: '12px',
    fontFamily: "'Georgia', serif",
  },
  taskList: {
    listStyleType: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  emptyMessage: {
    color: '#aaa',
    fontSize: '0.9rem',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '20px 0',
    margin: 0,
  },
  taskItemActive: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderRadius: '7px',
    border: '1.5px solid #e8e8e8',
    backgroundColor: '#fdfdfd',
    gap: '12px',
  },
  taskItemDone: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderRadius: '7px',
    border: '1.5px solid #e8e8e8',
    backgroundColor: '#f9f9f7',
    gap: '12px',
  },
  taskTitleActive: {
    fontSize: '0.95rem',
    color: '#1a1a1a',
    fontWeight: '500',
    flex: 1,
  },
  taskTitleDone: {
    fontSize: '0.95rem',
    color: '#bbb',
    fontWeight: '500',
    textDecoration: 'line-through',
    flex: 1,
  },
  buttonGroup: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
  },
  doneButton: {
    padding: '5px 12px',
    fontSize: '0.78rem',
    fontFamily: "'Courier New', monospace",
    fontWeight: '700',
    letterSpacing: '0.3px',
    backgroundColor: '#eafaf1',
    color: '#27ae60',
    border: '1.5px solid #a9dfbf',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  undoButton: {
    padding: '5px 12px',
    fontSize: '0.78rem',
    fontFamily: "'Courier New', monospace",
    fontWeight: '700',
    letterSpacing: '0.3px',
    backgroundColor: '#fef9e7',
    color: '#b7950b',
    border: '1.5px solid #f9e79f',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  editButton: {
    padding: '5px 12px',
    fontSize: '0.78rem',
    fontFamily: "'Courier New', monospace",
    fontWeight: '700',
    letterSpacing: '0.3px',
    backgroundColor: '#eaf2fb',
    color: '#2980b9',
    border: '1.5px solid #aed6f1',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  deleteButton: {
    padding: '5px 10px',
    fontSize: '0.82rem',
    fontFamily: "'Courier New', monospace",
    fontWeight: '700',
    backgroundColor: '#fdedec',
    color: '#c0392b',
    border: '1.5px solid #f5b7b1',
    borderRadius: '5px',
    cursor: 'pointer',
  },
}

export default App