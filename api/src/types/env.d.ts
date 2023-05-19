declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URI: string;
      GITHUB_CLIENT_SECRET: string;
      GITHUB_CLIENT_ID: string;
      ACCESS_TOKEN_SECRET: string;
    }
  }
}

export { }
