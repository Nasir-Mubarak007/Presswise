const config = {
  database: {
    provider: "pg",
  },
  emailVerification: {
    expiresIn: 60 * 60 * 24,
  },
  plugins: [],
};

export default config;