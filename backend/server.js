const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Parking Management API is running");
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const [slots] = await db.query(`
      SELECT COUNT(*) AS total,
      SUM(is_occupied = 1) AS occupied,
      SUM(is_occupied = 0) AS available
      FROM parking_slots
    `);

    const [vehicles] = await db.query(`
      SELECT v.id, v.vehicle_number, v.owner_name,
      v.vehicle_type, s.slot_number, v.entry_time
      FROM vehicles v
      JOIN parking_slots s ON s.id = v.slot_id
      WHERE v.status = 'Parked'
      ORDER BY v.entry_time DESC
    `);

    res.json({ slots: slots[0], vehicles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load dashboard" });
  }
});

app.get("/api/history", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT v.id, v.vehicle_number, v.owner_name,
      v.vehicle_type, s.slot_number, v.entry_time,
      v.exit_time, v.parking_fee, v.status
      FROM vehicles v
      JOIN parking_slots s ON s.id = v.slot_id
      ORDER BY v.id DESC LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load history" });
  }
});

app.post("/api/vehicles", async (req, res) => {
  const { vehicle_number, owner_name, vehicle_type } = req.body;

  if (!vehicle_number?.trim() || !owner_name?.trim() ||
      !["Car", "Bike", "Truck"].includes(vehicle_type)) {
    return res.status(400).json({
      error: "Enter valid vehicle, owner and vehicle type details"
    });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [existing] = await conn.query(
      "SELECT id FROM vehicles WHERE UPPER(vehicle_number) = UPPER(?) AND status = 'Parked' FOR UPDATE",
      [vehicle_number.trim()]
    );

    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({
        error: "This vehicle is already parked"
      });
    }

    const [slots] = await conn.query(
      "SELECT id, slot_number FROM parking_slots WHERE is_occupied = 0 ORDER BY id LIMIT 1 FOR UPDATE"
    );

    if (!slots.length) {
      await conn.rollback();
      return res.status(409).json({ error: "Parking is full" });
    }

    const slot = slots[0];

    await conn.query(
      "UPDATE parking_slots SET is_occupied = 1 WHERE id = ?",
      [slot.id]
    );

    await conn.query(
      `INSERT INTO vehicles
       (vehicle_number, owner_name, vehicle_type, slot_id)
       VALUES (?, ?, ?, ?)`,
      [
        vehicle_number.trim().toUpperCase(),
        owner_name.trim(),
        vehicle_type,
        slot.id
      ]
    );

    await conn.commit();
    res.status(201).json({
      message: `Vehicle parked successfully in ${slot.slot_number}`
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Unable to register vehicle" });
  } finally {
    if (conn) conn.release();
  }
});

app.post("/api/vehicles/:id/exit", async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, slot_id, entry_time
       FROM vehicles
       WHERE id = ? AND status = 'Parked'
       FOR UPDATE`,
      [req.params.id]
    );

    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({
        error: "Active parking record not found"
      });
    }

    const vehicle = rows[0];
    const exitTime = new Date();
    const entryTime = new Date(vehicle.entry_time);
    const hours = Math.max(
      1,
      Math.ceil((exitTime - entryTime) / 3600000)
    );

    // Example rates: Car ₹30/hour, Bike ₹15/hour,
    // Truck ₹50/hour. Minimum charge is one hour.
    const [details] = await conn.query(
      "SELECT vehicle_type FROM vehicles WHERE id = ?",
      [vehicle.id]
    );

    const rates = { Car: 30, Bike: 15, Truck: 50 };
    const fee = hours * rates[details[0].vehicle_type];

    await conn.query(
      `UPDATE vehicles
       SET status = 'Exited', exit_time = NOW(), parking_fee = ?
       WHERE id = ?`,
      [fee, vehicle.id]
    );

    await conn.query(
      "UPDATE parking_slots SET is_occupied = 0 WHERE id = ?",
      [vehicle.slot_id]
    );

    await conn.commit();
    res.json({
      message: "Vehicle exit recorded",
      hours,
      fee
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Unable to record vehicle exit" });
  } finally {
    if (conn) conn.release();
  }
});

async function startServer() {
  try {
    await db.query("SELECT 1");
    console.log("MySQL connected successfully!");
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("MySQL connection failed:", err.message);
    process.exit(1);
  }
}

startServer();