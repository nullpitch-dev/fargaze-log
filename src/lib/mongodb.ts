import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache;
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      autoIndex: true,  // explicit
      // HTTP 500s now and then (Hyoje, 12 Nov): a serverless instance gets few, short-lived
      // requests, so a small pool (Atlas M0 allows 500 connections across all instances), and
      // a clear failure in 8 s instead of hanging until the function times out.
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 8000,
    }).then((mongoose) => mongoose);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    // A failed connect was kept and failed every later request on this instance: forget it,
    // so the next request tries again.
    cached.promise = null;
    throw e;
  }
  return cached.conn;
}

export default connectDB;
