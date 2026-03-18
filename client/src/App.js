import React, { useState, useEffect } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import './App.css';

// setup chart.js
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function App() {
  const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
  const taskCountText = (count) => `${count} ${count === 1 ? 'task' : 'tasks'}`;
  const parseDriveLinks = (driveLinkValue) => {
    if (!driveLinkValue) return [];
    if (Array.isArray(driveLinkValue)) return driveLinkValue.filter(Boolean);
    if (typeof driveLinkValue !== 'string') return [];
    const trimmed = driveLinkValue.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (err) {
        console.log('could not parse drive links', err);
      }
    }
    return [trimmed];
  };
  // state for user auth
  const [user, setUser] = useState(null);
  const [isLogin, setIsLogin] = useState(true);
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authMessage, setAuthMessage] = useState('');

  // state for tasks
  const [myTasks, setMyTasks] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // state for form
  const [taskForm, setTaskForm] = useState({ title: '', description: '', deadline: '', files: [] });
  const [editingTask, setEditingTask] = useState(null);
  const [formStatus, setFormStatus] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const isSaving = formStatus === 'Saving...';

  // state for chart data
  const [chartData, setChartData] = useState({ labels: [], datasets: [] });
  // check if user already logged in
  useEffect(() => {
    const savedUser = localStorage.getItem('username');
    if (savedUser) {
      setUser(savedUser);
    }
  }, []);

  // load tasks when user logs in
  useEffect(() => {
    if (user) {
      loadTasks();
    }
  }, [user, page]);

  useEffect(() => {
    if (!isLogin || user || !googleClientId || !window.google?.accounts?.id) return;

    const buttonContainer = document.getElementById('google-signin-button');
    if (!buttonContainer) return;

    buttonContainer.innerHTML = '';
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleLogin,
    });
    window.google.accounts.id.renderButton(buttonContainer, {
      theme: 'outline',
      size: 'large',
      width: 260,
      text: 'signin_with',
    });
  }, [isLogin, user, googleClientId]);

  // function to get tasks from server
  async function loadTasks() {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/activities?page=' + page, {
        headers: { Authorization: 'Bearer ' + token }
      });
      console.log("got tasks:", response.data);
      setMyTasks(response.data.activities);
      setTotalPages(response.data.totalPages);

      // update chart data - count tasks by date
      const tasks = response.data.activities;
      const dateCounts = {};
      tasks.forEach(task => {
        if (task.deadline) {
          const date = new Date(task.deadline).toLocaleDateString();
          dateCounts[date] = (dateCounts[date] || 0) + 1;
        }
      });

      setChartData({
        labels: Object.keys(dateCounts),
        datasets: [{
          label: 'Tasks due',
          data: Object.values(dateCounts),
          backgroundColor: '#4E79A7',
          borderColor: '#3A5A80',
          borderWidth: 1,
          borderRadius: 6,
        }]
      });
      console.log("chart data updated");
    } catch (err) {
      console.log(err);
    }
  }

  // handle login/signup
  async function handleAuth(e) {
    e.preventDefault();
    try {
      const url = isLogin 
        ? 'http://localhost:5000/api/auth/login' 
        : 'http://localhost:5000/api/auth/signup';
      
      const response = await axios.post(url, authForm);
      
      if (isLogin) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('username', response.data.username);
        setUser(response.data.username);
        console.log("logged in!");
      } else {
        setAuthMessage("Account created! Please login.");
        setIsLogin(true);
      }
    } catch (err) {
      console.log(err);
      setAuthMessage(err.response?.data?.error || "Something went wrong");
    }
  }

  async function handleGoogleLogin(googleResponse) {
    try {
      const response = await axios.post('http://localhost:5000/api/auth/google', {
        idToken: googleResponse.credential,
      });
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('username', response.data.username);
      setUser(response.data.username);
      setAuthMessage('');
    } catch (err) {
      console.log(err);
      setAuthMessage(err.response?.data?.error || "Google login failed");
    }
  }

  // handle logout
  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setUser(null);
    setMyTasks([]);
  }

  // handle task form submit
  async function handleSubmitTask(e) {
    e.preventDefault();
    setFormStatus('Saving...');

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('title', taskForm.title);
      formData.append('description', taskForm.description);
      formData.append('deadline', taskForm.deadline);
      taskForm.files.forEach(file => formData.append('files', file));

      if (editingTask) {
        // update existing task
        await axios.put('http://localhost:5000/api/activities/' + editingTask.id, formData, {
          headers: { 
            Authorization: 'Bearer ' + token,
            'Content-Type': 'multipart/form-data'
          }
        });
        console.log("task updated");
      } else {
        // create new task
        await axios.post('http://localhost:5000/api/activities', formData, {
          headers: { 
            Authorization: 'Bearer ' + token,
            'Content-Type': 'multipart/form-data'
          }
        });
        console.log("task created");
      }

      // reset form and reload tasks
      setTaskForm({ title: '', description: '', deadline: '', files: [] });
      setEditingTask(null);
      setFormStatus('Saved!');
      loadTasks();
      
      setTimeout(() => setFormStatus(''), 2000);
    } catch (err) {
      console.log(err);
      setFormStatus('Error saving task');
    }
  }

  // handle delete task
  async function handleDelete(taskId) {
    if (!window.confirm("Delete this task?")) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete('http://localhost:5000/api/activities/' + taskId, {
        headers: { Authorization: 'Bearer ' + token }
      });
      console.log("task deleted");
      loadTasks();
    } catch (err) {
      console.log(err);
      alert("Could not delete task");
    }
  }

  // handle edit button click
  function handleEdit(task) {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description,
      deadline: task.deadline ? task.deadline.slice(0, 16) : '',
      files: []
    });
  }

  // cancel edit
  function cancelEdit() {
    setEditingTask(null);
    setTaskForm({ title: '', description: '', deadline: '', files: [] });
  }

  function setQuickDeadline(daysToAdd) {
    const date = new Date();
    date.setDate(date.getDate() + daysToAdd);
    date.setHours(17, 0, 0, 0);
    const localIso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setTaskForm({ ...taskForm, deadline: localIso });
  }

  function setSelectedFiles(fileList) {
    const incomingFiles = Array.from(fileList || []).filter(Boolean);
    if (incomingFiles.length === 0) return;
    setTaskForm(prev => ({ ...prev, files: [...prev.files, ...incomingFiles] }));
    setIsDraggingFile(false);
  }

  function removeSelectedFile(indexToRemove) {
    setTaskForm(prev => ({
      ...prev,
      files: prev.files.filter((_, index) => index !== indexToRemove),
    }));
  }

  function clearSelectedFiles() {
    setTaskForm(prev => ({ ...prev, files: [] }));
  }

  // export to pdf
  function exportPDF() {
    if (myTasks.length === 0) {
      alert("No tasks to export");
      return;
    }

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("OJT Progress Report", 14, 20);
    doc.setFontSize(10);
    doc.text("User: " + user, 14, 28);
    doc.text("Date: " + new Date().toLocaleDateString(), 14, 34);

    const tableData = myTasks.map(task => [
      task.title,
      task.description || "",
      task.deadline ? new Date(task.deadline).toLocaleString() : "No due date",
      parseDriveLinks(task.drive_link).length > 0 ? "Yes" : "No"
    ]);

    autoTable(doc, {
      head: [["Title", "Description", "Deadline", "File"]],
      body: tableData,
      startY: 40
    });

    doc.save(user + "_report.pdf");
  }

  // export to excel
  function exportExcel() {
    if (myTasks.length === 0) {
      alert("No tasks to export");
      return;
    }

    const reportRows = myTasks.map(task => ({
      Title: task.title,
      "Task Details": task.description || "",
      "Due Date": task.deadline ? new Date(task.deadline).toLocaleString() : "No due date",
      "Has Attachment": parseDriveLinks(task.drive_link).length > 0 ? "Yes" : "No",
    }));

    const worksheet = XLSX.utils.json_to_sheet(reportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Progress Report");
    XLSX.writeFile(workbook, user + "_progress_report.xlsx");
  }

  // show login page if not logged in
  if (!user) {
    return (
      <div className="login-page">
        <div className="login-box">
          <h2>{isLogin ? 'Login' : 'Sign Up'}</h2>
          <form onSubmit={handleAuth}>
            <input 
              type="text" 
              placeholder="Username" 
              value={authForm.username}
              onChange={(e) => setAuthForm({...authForm, username: e.target.value})}
              required
            />
            <input 
              type="password" 
              placeholder="Password" 
              value={authForm.password}
              onChange={(e) => setAuthForm({...authForm, password: e.target.value})}
              required
            />
            <button type="submit">{isLogin ? 'Login' : 'Sign Up'}</button>
          </form>
          <p onClick={() => setIsLogin(!isLogin)} style={{cursor: 'pointer', textDecoration: 'underline'}}>
            {isLogin ? "Need an account? Sign Up" : "Have an account? Login"}
          </p>
          {isLogin && (
            <div style={{marginTop: '12px', display: 'flex', justifyContent: 'center'}}>
              <div id="google-signin-button"></div>
            </div>
          )}
          {authMessage && <p style={{color: 'red'}}>{authMessage}</p>}
        </div>
      </div>
    );
  }

  // main app view
  return (
    <div className="app">
      <header>
        <h1>OJT Task App</h1>
        <div>
          <button onClick={exportPDF}>Download PDF Progress Report</button>
          <button onClick={exportExcel}>Download Excel Progress Report</button>
          <span style={{marginLeft: '10px'}}>{user}</span>
          <button onClick={handleLogout} style={{marginLeft: '10px'}}>Logout</button>
        </div>
      </header>

      <main>
        {/* task form */}
        <div className="form-section">
          <h3>{editingTask ? 'Update Task' : 'Create Task'}</h3>
          <p className="form-help">Fill in the details below to create a task.</p>
          {formStatus && <p role="status" className="form-status">{formStatus}</p>}
          <form onSubmit={handleSubmitTask}>
            <div>
              <label className="form-label">Task Title</label>
              <input 
                type="text" 
                value={taskForm.title}
                onChange={(e) => setTaskForm({...taskForm, title: e.target.value})}
                placeholder="e.g., Submit weekly report"
                required
              />
              <small className="field-help">Use a short, clear title.</small>
            </div>
            <div>
              <label className="form-label">Task Details</label>
              <textarea 
                value={taskForm.description}
                onChange={(e) => setTaskForm({...taskForm, description: e.target.value})}
                placeholder="Describe what needs to be done and any important notes."
                required
              />
              <small className="field-help">Include key steps or context for easier follow-through.</small>
            </div>
            <div>
              <label className="form-label">Due Date (Optional)</label>
              <input 
                type="datetime-local" 
                value={taskForm.deadline}
                onChange={(e) => setTaskForm({...taskForm, deadline: e.target.value})}
              />
              <div className="quick-actions">
                <button type="button" className="quick-btn" onClick={() => setQuickDeadline(0)}>Today</button>
                <button type="button" className="quick-btn" onClick={() => setQuickDeadline(1)}>Tomorrow</button>
                <button type="button" className="quick-btn" onClick={() => setQuickDeadline(7)}>Next Week</button>
              </div>
            </div>
            <div>
              <label className="form-label">Attachment (Optional)</label>
              <label
                className={`file-dropzone ${isDraggingFile ? 'dragging' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setSelectedFiles(e.dataTransfer.files);
                }}
              >
                <input
                  type="file"
                  multiple
                  className="file-input-hidden"
                  onChange={(e) => setSelectedFiles(e.target.files)}
                />
                <span className="dropzone-main"><strong>Drag & drop</strong> a file here, or click to choose</span>
                <span className="file-name">
                  {taskForm.files.length > 0
                    ? `Selected (${taskForm.files.length}): ${taskForm.files.map(file => file.name).join(', ')}`
                    : 'No file selected'}
                </span>
              </label>
              {taskForm.files.length > 0 && (
                <div className="selected-file-actions">
                  {taskForm.files.map((file, index) => (
                    <button
                      key={file.name + index}
                      type="button"
                      className="file-remove-btn"
                      onClick={() => removeSelectedFile(index)}
                    >
                      Remove {file.name}
                    </button>
                  ))}
                  <button type="button" className="file-clear-btn" onClick={clearSelectedFiles}>
                    Clear all
                  </button>
                </div>
              )}
              <small className="field-help">Attach supporting files if needed.</small>
            </div>
            <div>
              <button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : (editingTask ? 'Update Task' : 'Save Task')}</button>
              {editingTask && <button type="button" className="secondary-btn" onClick={cancelEdit}>Cancel</button>}
            </div>
          </form>
        </div>

        {/* chart section */}
        <div className="chart-section">
          <h3>Tasks by Due Date</h3>
          <p className="chart-help">Shows how many tasks are due on each date.</p>
          {chartData.labels.length > 0 ? (
            <div style={{maxWidth: '600px', margin: '0 auto'}}>
              <Bar
                data={chartData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { labels: { usePointStyle: true, boxWidth: 10 } },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: { precision: 0, stepSize: 1 },
                      grid: { color: '#E5E7EB' },
                    },
                    x: {
                      grid: { display: false },
                    },
                  },
                }}
              />
            </div>
          ) : (
            <p>No chart data yet. Add tasks with deadlines to see the chart.</p>
          )}
        </div>

        {/* tasks table */}
        <div className="tasks-section">
          <div className="section-heading">
            <h3>Task List</h3>
            <span className="count-badge">{taskCountText(myTasks.length)}</span>
          </div>
          
          {myTasks.length === 0 ? (
            <p>No tasks yet. Add one above!</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Description</th>
                  <th>Deadline</th>
                  <th>File Link</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {myTasks.map(task => (
                  <tr key={task.id}>
                    <td>{task.title}</td>
                    <td>{task.description}</td>
                    <td>
                      {task.deadline 
                        ? new Date(task.deadline).toLocaleString() 
                        : 'No deadline'}
                    </td>
                    <td>
                      {parseDriveLinks(task.drive_link).length > 0
                        ? parseDriveLinks(task.drive_link).map((link, index) => (
                            <div key={link + index}>
                              <a href={link} target="_blank" rel="noreferrer">File {index + 1}</a>
                            </div>
                          ))
                        : '—'}
                    </td>
                    <td className="task-actions">
                      <button onClick={() => handleEdit(task)}>Edit</button>
                      <button className="delete-btn" onClick={() => handleDelete(task.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* pagination */}
          {totalPages > 1 && (
            <div style={{marginTop: '20px', textAlign: 'center'}}>
              <button onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</button>
              <span style={{margin: '0 15px'}}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(page + 1)} disabled={page >= totalPages}>Next</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
