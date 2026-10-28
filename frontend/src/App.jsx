import { useEffect, useState } from "react";
import "./App.css";

// Local development API address.
// Change this to your deployed backend URL before deployment.
const API = "http://localhost:5000";

export default function App() {
  const [dashboard, setDashboard] = useState({
    slots: { total: 20, occupied: 0, available: 20 },
    vehicles: []
  });
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({
    vehicle_number: "",
    owner_name: "",
    vehicle_type: "Car"
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function request(path, options = {}) {
    const response = await fetch(API + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function refresh() {
    try {
      const [data, records] = await Promise.all([
        request("/api/dashboard"),
        request("/api/history")
      ]);
      setDashboard(data);
      setHistory(records);
    } catch (err) {
      setMessage(err.message + ". Check the backend and database.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function registerVehicle(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const result = await request("/api/vehicles", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setMessage(result.message);
      setForm({
        vehicle_number: "",
        owner_name: "",
        vehicle_type: "Car"
      });
      await refresh();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function exitVehicle(id) {
    setMessage("");
    try {
      const result = await request(`/api/vehicles/${id}/exit`, {
        method: "POST"
      });
      setMessage(
        `${result.message}. Duration: ${result.hours} hour(s). Fee: ₹${result.fee}`
      );
      await refresh();
    } catch (err) {
      setMessage(err.message);
    }
  }

  const { total = 0, occupied = 0, available = 0 } =
    dashboard.slots || {};

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">🅿 ParkEase</div>
        <span>Parking Management System</span>
      </header>

      <section className="welcome">
        <div>
          <p className="eyebrow">PARKING CONTROL CENTER</p>
          <h1>Parking Dashboard</h1>
          <p>Manage vehicle entries, exits and parking slots.</p>
        </div>
        <button className="refresh" onClick={refresh}>↻ Refresh</button>
      </section>

      {message && (
        <div className="message" role="status">{message}</div>
      )}

      <section className="stats">
        <article className="stat">
          <span>Total Slots</span>
          <strong>{total}</strong>
          <small>Parking capacity</small>
        </article>
        <article className="stat">
          <span>Occupied</span>
          <strong>{occupied || 0}</strong>
          <small>Vehicles currently parked</small>
        </article>
        <article className="stat">
          <span>Available</span>
          <strong>{available || 0}</strong>
          <small>Slots ready to use</small>
        </article>
      </section>

      <section className="panel">
        <h2>Register Vehicle Entry</h2>
        <form className="vehicle-form" onSubmit={registerVehicle}>
          <label>
            Vehicle Number
            <input
              required
              placeholder="TS09AB1234"
              value={form.vehicle_number}
              onChange={e => setForm({
                ...form, vehicle_number: e.target.value
              })}
            />
          </label>
          <label>
            Owner Name
            <input
              required
              placeholder="Enter owner name"
              value={form.owner_name}
              onChange={e => setForm({
                ...form, owner_name: e.target.value
              })}
            />
          </label>
          <label>
            Vehicle Type
            <select
              value={form.vehicle_type}
              onChange={e => setForm({
                ...form, vehicle_type: e.target.value
              })}
            >
              <option>Car</option>
              <option>Bike</option>
              <option>Truck</option>
            </select>
          </label>
          <button disabled={loading || available === 0}>
            {loading ? "Registering..." : "＋ Park Vehicle"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Currently Parked Vehicles</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Owner</th>
                <th>Type</th>
                <th>Slot</th>
                <th>Entry Time</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.vehicles.length === 0 ? (
                <tr><td colSpan="6" className="empty">
                  No vehicles currently parked
                </td></tr>
              ) : dashboard.vehicles.map(v => (
                <tr key={v.id}>
                  <td>{v.vehicle_number}</td>
                  <td>{v.owner_name}</td>
                  <td>{v.vehicle_type}</td>
                  <td><span className="slot">{v.slot_number}</span></td>
                  <td>{new Date(v.entry_time).toLocaleString()}</td>
                  <td>
                    <button className="exit"
                      onClick={() => exitVehicle(v.id)}>
                      Vehicle Exit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Parking History</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Slot</th>
                <th>Status</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>Fee</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan="6" className="empty">
                  No parking history yet
                </td></tr>
              ) : history.map(v => (
                <tr key={v.id}>
                  <td>{v.vehicle_number}</td>
                  <td>{v.slot_number}</td>
                  <td>{v.status}</td>
                  <td>{new Date(v.entry_time).toLocaleString()}</td>
                  <td>{v.exit_time
                    ? new Date(v.exit_time).toLocaleString()
                    : "—"}</td>
                  <td>₹{Number(v.parking_fee).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer>ParkEase · Full Stack Development Project</footer>
    </main>
  );
}