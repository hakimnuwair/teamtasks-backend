import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("DB connected successfully!");
  } catch (error) {
    console.log("Error connecting DB: ", error);
    process.exit(1);
  }
};
