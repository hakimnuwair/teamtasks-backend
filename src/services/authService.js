import User from "../models/User.js";

export const saveUser = async (user) => {
  try {
    const newUser = new User(user);
    return newUser.save();
  } catch (error) {
    throw error;
  }
};
