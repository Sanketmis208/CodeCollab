import mongoose from 'mongoose';

export async function connectDB(uri) {
  if (!uri) {
    console.warn('MONGO_URL not provided; skipping MongoDB connection. Set MONGO_URL to enable persistence.');
    return;
  }

  // Helpful debug: print the URI being used so we can detect if an unexpected
  // environment value (e.g., set in the shell) is overriding .env.
  try {
    console.log('MongoDB URI (raw):', uri);
  } catch (e) {
    // ignore
  }

  // Basic validation to catch obvious mistakes early and provide friendlier
  // output than the Mongo driver.
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    console.error('MONGO_URL does not appear to start with a valid scheme (mongodb:// or mongodb+srv://).');
    console.error('Provided MONGO_URL:', uri);
    throw new Error('Invalid MONGO_URL scheme.');
  }
  try {
    await mongoose.connect(uri, {
      // use the new unified topology and server discovery
      // mongoose 6+ uses sensible defaults; keep options minimal
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    throw err;
  }
}

export default mongoose;
