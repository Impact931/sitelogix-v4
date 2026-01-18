import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pass environment variables to the server runtime
  // These are set in AWS Amplify and need to be available at both build and runtime
  env: {
    ELEVEN_LABS_API_KEY: process.env.ELEVEN_LABS_API_KEY,
    ELEVEN_LABS_AGENT_ID: process.env.ELEVEN_LABS_AGENT_ID,
  },
};

export default nextConfig;
