import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({
  path: ".env.local",
});

const runMigrate = async () => {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not defined");
  }

  console.log("📍 Using database connection from POSTGRES_URL");
  console.log("📍 Connection string format:", process.env.POSTGRES_URL.substring(0, 30) + "...");

  const connection = postgres(process.env.POSTGRES_URL, { 
    max: 1,
    ssl: 'require', // Explicitly require SSL for Neon/Vercel
    connection: {
      application_name: 'drizzle_migration'
    }
  });

  const db = drizzle(connection);

  console.log("⏳ Running migrations...");

  const start = Date.now();
  
  try {
    await migrate(db, { migrationsFolder: "./lib/drizzle" });
    const end = Date.now();
    
    console.log("✅ Migrations completed in", end - start, "ms");
    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed");
    console.error("Error details:", error);
    await connection.end();
    process.exit(1);
  }
};

runMigrate().catch((err) => {
  console.error("❌ Migration failed");
  console.error(err);
  process.exit(1);
});