import mongoose from "mongoose";
import { connectDb } from "./db.js";
import { DashboardState } from "./models/DashboardState.js";
import { seedData } from "./data/seedData.js";

try {
  await connectDb();
  await DashboardState.deleteMany({});
  await DashboardState.create(seedData);
  console.log("Seeded dashboard data");
} catch (error) {
  console.error("Seed failed", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
