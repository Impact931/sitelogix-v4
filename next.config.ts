import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pass environment variables to the server runtime
  // These are set in AWS Amplify and need to be available at both build and runtime
  env: {
    // ElevenLabs configuration
    ELEVEN_LABS_API_KEY: process.env.ELEVEN_LABS_API_KEY,
    ELEVEN_LABS_AGENT_ID: process.env.ELEVEN_LABS_AGENT_ID,
    // Google OAuth configuration (for Sheets and Drive)
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    Google_Refresh_Token: process.env.Google_Refresh_Token,
    GOOGLE_SHEETS_ID: process.env.GOOGLE_SHEETS_ID,
    GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
    // Data adapter configuration
    DATA_ADAPTER: process.env.DATA_ADAPTER || 'google',
    FILE_ADAPTER: process.env.FILE_ADAPTER || 'google',
  },
};

export default nextConfig;
