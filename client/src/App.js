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
  const [taskForm, setTaskForm] = useState({ title: '', description: '', deadline: '', file: null });
  const [editingTask, setEditingTask] = useState(null);
  const [formStatus, setFormStatus] = useState('');

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
          label: 'Tasks per Day',
          data: Object.values(dateCounts),
          backgroundColor: '#4CAF50',
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
      if (taskForm.file) {
        formData.append('file', taskForm.file);
      }

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
      setTaskForm({ title: '', description: '', deadline: '', file: null });
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
      file: null
    });
  }

  // cancel edit
  function cancelEdit() {
    setEditingTask(null);
    setTaskForm({ title: '', description: '', deadline: '', file: null });
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
      task.deadline ? new Date(task.deadline).toLocaleDateString() : "No deadline",
      task.drive_link ? "Yes" : "No"
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

    const worksheet = XLSX.utils.json_to_sheet(myTasks);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tasks");
    XLSX.writeFile(workbook, user + "_tasks.xlsx");
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
          <button onClick={exportPDF}>Export PDF</button>
          <button onClick={exportExcel}>Export Excel</button>
          <span style={{marginLeft: '10px'}}>{user}</span>
          <button onClick={handleLogout} style={{marginLeft: '10px'}}>Logout</button>
        </div>
      </header>

      <main>
        {/* task form */}
        <div className="form-section">
          <h3>{editingTask ? 'Edit Task' : 'Add New Task'}</h3>
          {formStatus && <p>{formStatus}</p>}
          <form onSubmit={handleSubmitTask}>
            <div>
              <label>Title:</label>
              <input 
                type="text" 
                value={taskForm.title}
                onChange={(e) => setTaskForm({...taskForm, title: e.target.value})}
                required
              />
            </div>
            <div>
              <label>Description:</label>
              <textarea 
                value={taskForm.description}
                onChange={(e) => setTaskForm({...taskForm, description: e.target.value})}
                required
              />
            </div>
            <div>
              <label>Deadline:</label>
              <input 
                type="datetime-local" 
                value={taskForm.deadline}
                onChange={(e) => setTaskForm({...taskForm, deadline: e.target.value})}
                required
              />
            </div>
            <div>
              <label>Upload File:</label>
              <input 
                type="file" 
                onChange={(e) => setTaskForm({...taskForm, file: e.target.files[0]})}
              />
            </div>
            <div>
              <button type="submit">{editingTask ? 'Update' : 'Add Task'}</button>
              {editingTask && <button type="button" onClick={cancelEdit}>Cancel</button>}
            </div>
          </form>
        </div>

        {/* chart section */}
        <div className="chart-section">
          <h3>Tasks by Deadline Date</h3>
          {chartData.labels.length > 0 ? (
            <div style={{maxWidth: '600px', margin: '0 auto'}}>
              <Bar data={chartData} options={{ responsive: true }} />
            </div>
          ) : (
            <p>No chart data yet. Add tasks with deadlines to see the chart.</p>
          )}
        </div>

        {/* tasks table */}
        <div className="tasks-section">
          <h3>My Tasks ({myTasks.length})</h3>
          
          {myTasks.length === 0 ? (
            <p>No tasks yet. Add one above!</p>
          ) : (
            <table border="1" cellPadding="10" style={{width: '100%', borderCollapse: 'collapse'}}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Description</th>
                  <th>Deadline</th>
                  <th>File</th>
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
                      {task.drive_link 
                        ? <a href={task.drive_link} target="_blank" rel="noreferrer">View File</a>
                        : 'None'}
                    </td>
                    <td>
                      <button onClick={() => handleEdit(task)}>Edit</button>
                      <button onClick={() => handleDelete(task.id)} style={{marginLeft: '5px'}}>Delete</button>
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