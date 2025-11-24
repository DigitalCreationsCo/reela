import { config } from "dotenv";
import postgres from "postgres";

config({
  path: ".env.local",
});

const runReset = async () => {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not defined");
  }

  console.log("📍 Using database connection from POSTGRES_URL");

  const connection = postgres(process.env.POSTGRES_URL, { 
    max: 1,
    ssl: 'require',
  });

  try {
    console.log("⏳ Dropping all tables...");
    const start = Date.now();
    
    await connection`DROP SCHEMA public CASCADE;`;
    await connection`CREATE SCHEMA public;`;

    const end = Date.now();
    console.log("✅ All tables dropped in", end - start, "ms");
    
    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to drop tables");
    console.error("Error details:", error);
    await connection.end();
    process.exit(1);
  }
};

runReset().catch((err) => {
  console.error("❌ Failed to drop tables");
  console.error(err);
  process.exit(1);
});
