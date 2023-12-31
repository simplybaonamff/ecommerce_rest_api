import { authModel } from "../models/userModels";
import { mailer } from "../config/nodeMailer";
import CustomAPIError from "../helpers/custom-errors";
import UnauthenticatedError from "../helpers/unauthenticated";
import { validateMongoDbID } from "../helpers/validateDbId";
import { StatusCodes } from "http-status-codes";
import { generateToken } from "../helpers/jsonWebToken";
import { generateRefreshToken } from "../helpers/refreshToken";
import { Request } from "express";
import { UserDataInterface } from "../interfaces/user_interface";
import jwt, { JwtPayload } from "jsonwebtoken";
import { blacklistTokens } from "../models/blacklistTokens";

interface IDecoded {
  id: string;
}

// User signup Services
export const create_user_service = async (userData: UserDataInterface) => {
  const newUser = await authModel.create({ ...userData });
  const userToken = newUser.createJWT();

  // Send a welcome
  const { email } = newUser;
  const subject = "Welcome to Online Shopping Mall";
  const text = "This is an online shopping mall shop with ease";

  mailer(email, subject, text);
  return { newUser, userToken };
};

// Login User service
export const login_user_service = async (
  userData: Partial<UserDataInterface>
) => {
  const { email, password } = userData; // Extract Email and Password from userData

  // checking if both fields are omitted
  if (!email || !password) {
    throw new CustomAPIError(
      `Email and Password are required for login.`,
      StatusCodes.BAD_REQUEST
    );
  }
  const userExists = await authModel.findOne({ email: email });
  if (!userExists) {
    throw new UnauthenticatedError(
      "Password or email didn't match any on our database",
      StatusCodes.NOT_FOUND
    );
  }
  // comparing the password of the user.
  const isMatch = await userExists.comparePwd(password);
  if (!isMatch) {
    throw new UnauthenticatedError(
      "Password or email didn't match any on our database",
      StatusCodes.NOT_FOUND
    );
  } else {
    //const token = userExists.createJWT();
    const token: string = generateToken(userExists._id);
    const refreshToken = generateRefreshToken(userExists._id);
    const updateLoggedUser = await authModel.findByIdAndUpdate(
      userExists._id,
      {
        refreshToken: refreshToken,
      },
      { new: true }
    );
    return { userExists, token, updateLoggedUser };
  }
};

// get all users service
export const get_all_users_service = async (): Promise<UserDataInterface[]> => {
  const getUsers = await authModel.find();
  if (getUsers.length <= 0) {
    throw new CustomAPIError(`No users found`, StatusCodes.NO_CONTENT);
  }
  return getUsers;
};

// Get a Single user Service
export const get_single_user_service = async (
  userID: string
): Promise<UserDataInterface> => {
  const id = userID; // destructure the user ID from the user
  validateMongoDbID(id);
  const userExists = await authModel.findById({ _id: id });
  console.log(userExists);
  if (!userExists) {
    throw new CustomAPIError(
      `The User with the ID: ${id} does not exist`,
      StatusCodes.NOT_FOUND
    );
  }
  return userExists;
};

//Delete a single user service
export const delete_single_user = async (
  userId: Partial<UserDataInterface>
): Promise<UserDataInterface> => {
  const { id } = userId;
  validateMongoDbID(id);
  const user = await authModel.findOneAndDelete({ _id: userId.id });
  console.log(user);
  if (!user)
    throw new CustomAPIError(
      `The user with the ID: ${id} does not exist`,
      StatusCodes.NOT_FOUND
    );
  return user;
};

// Updating the user Service
export const updateUserService = async (
  userId: Partial<UserDataInterface>,
  updateData: UserDataInterface
): Promise<UserDataInterface> => {
  const { id } = userId;
  validateMongoDbID(id);
  const updateuser = await authModel.findOneAndUpdate({ _id: id }, updateData, {
    new: true,
    runValidators: true,
  });
  console.log(userId);
  if (!updateuser) {
    throw new CustomAPIError(
      `The user with the id: ${id} was not found to be updated`,
      StatusCodes.NOT_FOUND
    );
  }
  return updateuser;
};

// blocking a user service
export const blockUserService = async (
  User: Partial<UserDataInterface>
): Promise<UserDataInterface> => {
  const { id } = User;
  validateMongoDbID(id);
  const blockUser = await authModel.findByIdAndUpdate(
    id,
    { isBlocked: true },
    { new: true }
  );
  if (!blockUser) {
    throw new UnauthenticatedError(
      "The User is not avauilable on our database",
      StatusCodes.NO_CONTENT
    );
  } else {
    return blockUser;
  }
};

// unblocking a user
export const unBlockUserService = async (
  User: Partial<UserDataInterface>
): Promise<UserDataInterface> => {
  const { id } = User;
  validateMongoDbID(id);
  const unblockuser = await authModel.findByIdAndUpdate(
    id,
    { isBlocked: false },
    {
      new: true,
    }
  );
  if (!unblockuser)
    throw new UnauthenticatedError(
      "The User is not avauilable on our database",
      StatusCodes.NO_CONTENT
    );
  return unblockuser;
};

// handle refresh Token service
export const handle_refresh_token_service = async (
  cookies: UserDataInterface
) => {
  const refreshToken = cookies.refreshToken;
  if (!refreshToken) {
    throw new CustomAPIError(
      "There is no refresh token in cookies",
      StatusCodes.NOT_FOUND
    );
  }
  const token = await authModel.findOne({ refreshToken });
  if (!token)
    throw new CustomAPIError(
      "There are no refresh Tokens in cookies",
      StatusCodes.UNAUTHORIZED
    );
  let accessToken;
  try {
    jwt.verify(refreshToken, process.env.JWT_SECRET!, (err, decoded) => {
      const decodeJWT = decoded as IDecoded;
      console.log("decodedData: ", decodeJWT);
      if (err || !decoded || token.id !== decodeJWT.id) {
        throw new CustomAPIError(
          "There is something wrong with the refresh token",
          StatusCodes.NOT_ACCEPTABLE
        );
      }
      accessToken = generateToken(token.id);
    });
  } catch (error) {
    throw new CustomAPIError(
      "Error verifying refresh token",
      StatusCodes.UNAUTHORIZED
    );
  }
  return accessToken;
};

// Logout Service functionality
export const LogoutService = async (cookies: string): Promise<UserDataInterface | void>=> {
  const refreshToken = cookies;

  if (!refreshToken) {
    throw new CustomAPIError(
      "There is no refresh token in cookies",
      StatusCodes.NOT_FOUND
    );
  }
  const token = await authModel.findOne({ refreshToken });

  if (!token) {
    throw new CustomAPIError(
      "There are no refresh token in cookies",
      StatusCodes.UNAUTHORIZED
    );
  }

  try {
    jwt.verify(refreshToken, process.env.JWT_SECRET!, (err, decoded) => {
      const decodeJWT = decoded as IDecoded;
      console.log("decodedData: ", decodeJWT);
      if (err || token.id !== decodeJWT.id) {
        throw new CustomAPIError(
          "There is something wrong with the refresh token",
          StatusCodes.NOT_ACCEPTABLE
        );
      }

      // Assuming you have a blacklistTokens model
      blacklistTokens.create({ token: refreshToken });
    });
  } catch (error) {
    throw new CustomAPIError(
      "Error verifying refresh token",
      StatusCodes.UNAUTHORIZED
    );
  }
};
