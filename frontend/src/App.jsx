import { useCallback, useEffect, useState } from 'react'

const API_BASE_URL = 'http://127.0.0.1:5000'

function App() {
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [employees, setEmployees] = useState([])
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskDurationDays, setNewTaskDurationDays] = useState("0")
  const [newTaskDurationHours, setNewTaskDurationHours] = useState("0")
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("")
  const [selectedSupervisorId, setSelectedSupervisorId] = useState("")
  const [selectedAdminEmployeeId, setSelectedAdminEmployeeId] = useState("")
  const [token, setToken] = useState(localStorage.getItem("token") || null)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isLoginMode, setIsLoginMode] = useState(true)
  const [authError, setAuthError] = useState("")
  const [pageError, setPageError] = useState("")
  const [role, setRole] = useState(localStorage.getItem("role") || null)

  const apiRequest = useCallback(async function apiRequest(path, options = {}) {
    const headers = {
      ...options.headers,
    }

    if (options.body) {
      headers['Content-Type'] = 'application/json'
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.error || "Request failed")
    }

    return data
  }, [token])

  async function handleAuthSubmit(event) {
    event.preventDefault()
    setAuthError("")
    const endpoint = isLoginMode ? '/login' : '/register'

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
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
      } else {
        alert("Registration successful! You can now log in.")
        setIsLoginMode(true)
        setPassword("")
      }
    } catch {
      setAuthError("Network error. Is the Flask server running?")
    }
  }

  function handleLogout() {
    localStorage.removeItem("token")
    localStorage.removeItem("role")
    setToken(null)
    setRole(null)
    setTasks([])
    setUsers([])
    setEmployees([])
    setPageError("")
  }

  const loadTasksFromServer = useCallback(async function loadTasksFromServer() {
    try {
      const data = await apiRequest('/tasks')
      setTasks(data.tasks || [])
    } catch (error) {
      setPageError(error.message)
    }
  }, [apiRequest])

  const loadUsers = useCallback(async function loadUsers() {
    try {
      const data = await apiRequest('/users')
      setUsers(data.users || [])
    } catch (error) {
      setPageError(error.message)
    }
  }, [apiRequest])

  const loadMyEmployees = useCallback(async function loadMyEmployees() {
    try {
      const data = await apiRequest('/my-employees')
      const loadedEmployees = data.employees || []
      setEmployees(loadedEmployees)
      if (!selectedEmployeeId && loadedEmployees.length > 0) {
        setSelectedEmployeeId(String(loadedEmployees[0].id))
      }
    } catch (error) {
      setPageError(error.message)
    }
  }, [apiRequest, selectedEmployeeId])

  useEffect(() => {
    if (!token) return

    async function loadDashboardData() {
      await loadTasksFromServer()

      if (role === 'admin') {
        await loadUsers()
      }

      if (role === 'supervisor') {
        await loadMyEmployees()
      }
    }

    loadDashboardData()
  }, [token, role, loadTasksFromServer, loadUsers, loadMyEmployees])

  async function handleRoleChange(userId, newRole) {
    setPageError("")

    try {
      await apiRequest(`/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      })
      await loadUsers()
    } catch (error) {
      setPageError(error.message)
    }
  }

  async function handleDeleteUser(user) {
    const confirmed = window.confirm(`Delete account for ${user.username}? Related tasks will also be deleted.`)
    if (!confirmed) return

    setPageError("")

    try {
      await apiRequest(`/users/${user.id}`, { method: 'DELETE' })
      await loadUsers()
      await loadTasksFromServer()
    } catch (error) {
      setPageError(error.message)
    }
  }

  async function handleAssignEmployee(event) {
    event.preventDefault()
    setPageError("")

    if (!selectedSupervisorId || !selectedAdminEmployeeId) {
      setPageError("Choose both a supervisor and an employee.")
      return
    }

    try {
      await apiRequest(
        `/supervisors/${selectedSupervisorId}/employees/${selectedAdminEmployeeId}`,
        { method: 'POST', body: JSON.stringify({}) },
      )
      await loadUsers()
    } catch (error) {
      setPageError(error.message)
    }
  }

  async function handleRemoveEmployee(supervisorId, employeeId) {
    setPageError("")

    try {
      await apiRequest(`/supervisors/${supervisorId}/employees/${employeeId}`, {
        method: 'DELETE',
      })
      await loadUsers()
    } catch (error) {
      setPageError(error.message)
    }
  }

  async function handleAddTask(event) {
    event.preventDefault()
    setPageError("")

    const durationDays = calculateDurationDays(
      newTaskDurationDays,
      newTaskDurationHours,
    )

    if (newTaskTitle.trim() === "" || !selectedEmployeeId || durationDays <= 0) {
      setPageError("Task title, employee, and completion period are required.")
      return
    }

    try {
      const newlyCreatedTask = await apiRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: newTaskTitle,
          assigned_to_id: Number(selectedEmployeeId),
          duration_days: durationDays,
        }),
      })
      setTasks([...tasks, newlyCreatedTask])
      setNewTaskTitle("")
      setNewTaskDurationDays("0")
      setNewTaskDurationHours("0")
    } catch (error) {
      setPageError(error.message)
    }
  }

  async function handleToggleDone(task) {
    setPageError("")

    try {
      const updatedTask = await apiRequest(`/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ done: !task.done }),
      })
      setTasks(tasks.map((currentTask) => (
        currentTask.id === task.id ? updatedTask : currentTask
      )))
    } catch (error) {
      setPageError(error.message)
    }
  }

  async function handleEditTask(task) {
    const newTitle = window.prompt("Edit task title:", task.title)
    if (!newTitle || newTitle.trim() === "") return

    const newDurationDays = window.prompt(
      "Reset deadline: days from now?",
      "0",
    )
    if (newDurationDays === null) return

    const newDurationHours = window.prompt(
      "Reset deadline: hours from now?",
      "1",
    )
    if (newDurationHours === null) return

    const durationDays = calculateDurationDays(newDurationDays, newDurationHours)
    if (durationDays <= 0) {
      setPageError("Completion period must be greater than 0.")
      return
    }

    setPageError("")

    try {
      const updatedTask = await apiRequest(`/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: newTitle,
          duration_days: durationDays,
        }),
      })
      setTasks(tasks.map((currentTask) => (
        currentTask.id === task.id ? updatedTask : currentTask
      )))
    } catch (error) {
      setPageError(error.message)
    }
  }

  async function handleDelete(taskId) {
    setPageError("")

    try {
      await apiRequest(`/tasks/${taskId}`, { method: 'DELETE' })
      setTasks(tasks.filter((task) => task.id !== taskId))
    } catch (error) {
      setPageError(error.message)
    }
  }

  const supervisors = users.filter((user) => user.role === 'supervisor')
  const adminEmployees = users.filter((user) => user.role === 'employee')

  return (
    <div style={styles.pageBackground}>
      <div style={styles.contentColumn}>
        <header style={styles.header}>
          <div style={styles.headerAccent} />
          <div>
            <h1 style={styles.heading}>Task Manager</h1>
            {role && <p style={styles.roleBadge}>{role} dashboard</p>}
          </div>

          {token && (
            <button onClick={handleLogout} style={styles.logoutButton}>
              Log Out
            </button>
          )}
        </header>

        {!token ? renderAuthCard() : renderDashboard()}
      </div>
    </div>
  )

  function renderAuthCard() {
    return (
      <div style={styles.card}>
        <p style={styles.sectionLabel}>{isLoginMode ? 'SECURE LOGIN' : 'CREATE ACCOUNT'}</p>

        {authError && <p style={styles.errorText}>{authError}</p>}

        <form onSubmit={handleAuthSubmit} style={styles.authForm}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            style={styles.input}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
    )
  }

  function renderDashboard() {
    return (
      <div>
        {pageError && <p style={styles.errorBanner}>{pageError}</p>}
        {role === 'admin' && renderAdminDashboard()}
        {role === 'supervisor' && renderSupervisorDashboard()}
        {role === 'employee' && renderEmployeeDashboard()}
      </div>
    )
  }

  function renderAdminDashboard() {
    return (
      <>
        <div style={styles.card}>
          <p style={styles.sectionLabel}>
            USERS
            <span style={styles.taskCount}>{users.length}</span>
          </p>

          {users.length === 0 && <p style={styles.emptyMessage}>No users yet.</p>}

          <ul style={styles.taskList}>
            {users.map((user) => (
              <li key={user.id} style={styles.userItem}>
                <div>
                  <span style={styles.taskTitleActive}>{user.username}</span>
                  <p style={styles.metaText}>{user.role}</p>
                </div>

                {user.role !== 'admin' && (
                  <div style={styles.userActions}>
                    <select
                      value={user.role}
                      onChange={(event) => handleRoleChange(user.id, event.target.value)}
                      style={styles.select}
                    >
                      <option value="employee">employee</option>
                      <option value="supervisor">supervisor</option>
                    </select>
                    <button
                      onClick={() => handleDeleteUser(user)}
                      style={styles.deleteButton}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div style={styles.card}>
          <p style={styles.sectionLabel}>ASSIGN EMPLOYEES</p>

          <form onSubmit={handleAssignEmployee} style={styles.formStack}>
            <select
              value={selectedSupervisorId}
              onChange={(event) => setSelectedSupervisorId(event.target.value)}
              style={styles.input}
            >
              <option value="">Choose supervisor</option>
              {supervisors.map((supervisor) => (
                <option key={supervisor.id} value={supervisor.id}>
                  {supervisor.username}
                </option>
              ))}
            </select>

            <select
              value={selectedAdminEmployeeId}
              onChange={(event) => setSelectedAdminEmployeeId(event.target.value)}
              style={styles.input}
            >
              <option value="">Choose employee</option>
              {adminEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.username}
                </option>
              ))}
            </select>

            <button type="submit" style={styles.addButton}>
              Assign Employee
            </button>
          </form>
        </div>

        <div style={styles.card}>
          <p style={styles.sectionLabel}>SUPERVISOR TEAMS</p>

          {supervisors.length === 0 && (
            <p style={styles.emptyMessage}>No supervisors yet.</p>
          )}

          <ul style={styles.taskList}>
            {supervisors.map((supervisor) => (
              <li key={supervisor.id} style={styles.teamItem}>
                <div>
                  <span style={styles.taskTitleActive}>{supervisor.username}</span>
                  <p style={styles.metaText}>
                    {(supervisor.assigned_employees || []).length} employee(s)
                  </p>
                </div>

                <div style={styles.chipGroup}>
                  {(supervisor.assigned_employees || []).map((employee) => (
                    <button
                      key={employee.id}
                      onClick={() => handleRemoveEmployee(supervisor.id, employee.id)}
                      style={styles.relationshipChip}
                    >
                      {employee.username} x
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </>
    )
  }

  function renderSupervisorDashboard() {
    return (
      <>
        <div style={styles.card}>
          <p style={styles.sectionLabel}>ADD NEW TASK</p>

          {employees.length === 0 ? (
            <p style={styles.emptyMessage}>No employees assigned to you yet.</p>
          ) : (
            <form onSubmit={handleAddTask} style={styles.formStack}>
              <input
                type="text"
                placeholder="What needs to be done?"
                value={newTaskTitle}
                onChange={(event) => setNewTaskTitle(event.target.value)}
                style={styles.input}
              />

              <select
                value={selectedEmployeeId}
                onChange={(event) => setSelectedEmployeeId(event.target.value)}
                style={styles.input}
              >
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.username}
                  </option>
                ))}
              </select>

              <div style={styles.durationRow}>
                <span style={styles.durationLabel}>Finish within</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={newTaskDurationDays}
                  onChange={(event) => setNewTaskDurationDays(event.target.value)}
                  style={styles.durationInput}
                />
                <span style={styles.durationLabel}>days and</span>
                <input
                  type="number"
                  min="0"
                  max="23"
                  step="1"
                  value={newTaskDurationHours}
                  onChange={(event) => setNewTaskDurationHours(event.target.value)}
                  style={styles.durationInput}
                />
                <span style={styles.durationLabel}>hours</span>
              </div>

              <button type="submit" style={styles.addButton}>
                + Add Task
              </button>
            </form>
          )}
        </div>

        {renderTaskList("TASKS I CREATED")}
      </>
    )
  }

  function renderEmployeeDashboard() {
    return renderTaskList("MY TASKS")
  }

  function renderTaskList(label) {
    return (
      <div style={styles.card}>
        <p style={styles.sectionLabel}>
          {label}
          <span style={styles.taskCount}>{tasks.length}</span>
        </p>

        {tasks.length === 0 && (
          <p style={styles.emptyMessage}>No tasks yet.</p>
        )}

        <ul style={styles.taskList}>
          {tasks.map((task) => (
            <li key={task.id} style={task.done ? styles.taskItemDone : styles.taskItemActive}>
              <div style={styles.taskTextBlock}>
                <span style={task.done ? styles.taskTitleDone : styles.taskTitleActive}>
                  {task.title}
                </span>
                <p style={styles.metaText}>
                  Assigned to {task.assigned_to?.username || "unknown"} by {task.created_by?.username || "unknown"} | Due {formatDate(task.deadline)}
                </p>
                {task.is_overdue && <p style={styles.lateText}>Overdue</p>}
                {task.completed_late && <p style={styles.lateText}>Completed late</p>}
              </div>

              <div style={styles.buttonGroup}>
                <button
                  onClick={() => handleToggleDone(task)}
                  style={task.done ? styles.undoButton : styles.doneButton}
                >
                  {task.done ? "Undo" : "Done"}
                </button>

                {(role === 'admin' || role === 'supervisor') && (
                  <>
                    <button onClick={() => handleEditTask(task)} style={styles.editButton}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(task.id)} style={styles.deleteButton}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  }
}

function formatDate(value) {
  if (!value) return "No deadline"
  return new Date(value).toLocaleString()
}

function calculateDurationDays(days, hours) {
  const parsedDays = Number(days)
  const parsedHours = Number(hours)

  if (Number.isNaN(parsedDays) || Number.isNaN(parsedHours)) {
    return 0
  }

  return parsedDays + parsedHours / 24
}

const styles = {
  pageBackground: {
    minHeight: '100vh',
    width: '100%',
    backgroundColor: '#f5f4f0',
    fontFamily: "'Georgia', serif",
  },
  contentColumn: {
    maxWidth: '760px',
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
    textAlign: 'left',
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
  roleBadge: {
    marginTop: '6px',
    fontSize: '0.75rem',
    fontFamily: "'Courier New', monospace",
    textTransform: 'uppercase',
    color: '#999',
    letterSpacing: '1px',
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
    textAlign: 'left',
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
  authForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  formStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
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
  durationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    padding: '10px 14px',
    border: '1.5px solid #ddd',
    borderRadius: '6px',
    backgroundColor: '#fafafa',
  },
  durationInput: {
    width: '70px',
    padding: '8px 10px',
    fontSize: '0.95rem',
    border: '1.5px solid #ddd',
    borderRadius: '6px',
    outline: 'none',
    fontFamily: "'Georgia', serif",
    backgroundColor: '#fff',
    color: '#1a1a1a',
  },
  durationLabel: {
    color: '#555',
    fontSize: '0.9rem',
  },
  select: {
    padding: '8px 10px',
    fontSize: '0.85rem',
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
  errorBanner: {
    color: '#c0392b',
    backgroundColor: '#fdedec',
    border: '1.5px solid #f5b7b1',
    borderRadius: '8px',
    padding: '10px 14px',
    marginBottom: '16px',
    fontSize: '0.9rem',
    textAlign: 'left',
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
  userItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderRadius: '7px',
    border: '1.5px solid #e8e8e8',
    backgroundColor: '#fdfdfd',
    gap: '12px',
  },
  userActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  teamItem: {
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 16px',
    borderRadius: '7px',
    border: '1.5px solid #e8e8e8',
    backgroundColor: '#fdfdfd',
    gap: '10px',
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
  taskTextBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  },
  taskTitleActive: {
    fontSize: '0.95rem',
    color: '#1a1a1a',
    fontWeight: '500',
  },
  taskTitleDone: {
    fontSize: '0.95rem',
    color: '#bbb',
    fontWeight: '500',
    textDecoration: 'line-through',
  },
  metaText: {
    color: '#999',
    fontSize: '0.78rem',
    margin: 0,
  },
  lateText: {
    color: '#c0392b',
    fontSize: '0.78rem',
    fontFamily: "'Courier New', monospace",
    fontWeight: '700',
    margin: 0,
  },
  buttonGroup: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  chipGroup: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  relationshipChip: {
    padding: '5px 10px',
    fontSize: '0.78rem',
    fontFamily: "'Courier New', monospace",
    fontWeight: '700',
    backgroundColor: '#fdedec',
    color: '#c0392b',
    border: '1.5px solid #f5b7b1',
    borderRadius: '20px',
    cursor: 'pointer',
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
