import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data-local");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Simple file-based database for local development
export const localDB = {
  users: [],
  dashboards: [],
  logs: [],

  saveData() {
    fs.writeFileSync(
      path.join(dataDir, "db.json"),
      JSON.stringify(
        {
          users: this.users,
          dashboards: this.dashboards,
          logs: this.logs,
        },
        null,
        2
      )
    );
  },

  loadData() {
    const dbPath = path.join(dataDir, "db.json");
    if (fs.existsSync(dbPath)) {
      const data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
      this.users = data.users || [];
      this.dashboards = data.dashboards || [];
      this.logs = data.logs || [];
    }
  },

  createUser(userData) {
    const id = Date.now().toString();
    const user = { _id: id, ...userData, createdAt: new Date() };
    this.users.push(user);
    this.saveData();
    return user;
  },

  findUserByEmail(email) {
    return this.users.find((u) => u.email === email);
  },

  findUserById(id) {
    return this.users.find((u) => u._id === id);
  },

  findOrCreateDashboard(userId) {
    let dashboard = this.dashboards.find((d) => d.userId === userId);
    if (!dashboard) {
      dashboard = { _id: Date.now().toString(), userId, data: {} };
      this.dashboards.push(dashboard);
      this.saveData();
    }
    return dashboard;
  },

  updateDashboard(userId, data) {
    const dashboard = this.dashboards.find((d) => d.userId === userId);
    if (dashboard) {
      dashboard.data = { ...dashboard.data, ...data };
      this.saveData();
      return dashboard;
    }
    return null;
  },
};

// Load data on startup
localDB.loadData();
