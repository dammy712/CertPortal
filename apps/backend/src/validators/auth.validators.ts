import { body } from 'express-validator';

export const registerValidator = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required.')
    .isLength({ min: 2, max: 50 }).withMessage('First name must be 2–50 characters.'),

  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required.')
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be 2–50 characters.'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Enter a valid email address.')
    .normalizeEmail(),

  body('phone')
    .optional()
    .trim()
    .isMobilePhone('any').withMessage('Enter a valid phone number.'),

  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.')
    .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character.'),
];

export const loginValidator = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Enter a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.'),

  body('totpCode')
    .optional()
    .trim()
    .isLength({ min: 6, max: 8 }).withMessage('Invalid authenticator code.'),
];

export const refreshTokenValidator = [
  body('refreshToken')
    .notEmpty().withMessage('Refresh token is required.'),
];

export const forgotPasswordValidator = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Enter a valid email address.')
    .normalizeEmail(),
];

export const resetPasswordValidator = [
  body('token')
    .notEmpty().withMessage('Reset token is required.'),

  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.')
    .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character.'),
];

export const changePasswordValidator = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required.'),

  body('newPassword')
    .notEmpty().withMessage('New password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Must contain at least one uppercase letter.')
    .matches(/[a-z]/).withMessage('Must contain at least one lowercase letter.')
    .matches(/[0-9]/).withMessage('Must contain at least one number.')
    .matches(/[^A-Za-z0-9]/).withMessage('Must contain at least one special character.'),
];

export const totpValidator = [
  body('totpCode')
    .trim()
    .notEmpty().withMessage('Authenticator code is required.')
    .isLength({ min: 6, max: 6 }).withMessage('Code must be exactly 6 digits.')
    .isNumeric().withMessage('Code must contain only numbers.'),
];
