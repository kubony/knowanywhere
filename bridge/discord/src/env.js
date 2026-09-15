import process from 'node:process';
import dotenv from 'dotenv';

/**
 * .env 를 읽는 곳. ENV_FILE 이 있으면 그 파일을, 없으면 cwd 의 .env 를 읽는다.
 * 코드베이스 하나로 봇 여러 개(예: .env 와 .env.second-agent)를 돌리기 위해서다.
 * dotenv 는 process.env 에 이미 있는 값을 덮어쓰지 않는다.
 */
const envFile = process.env.ENV_FILE;
dotenv.config(envFile ? { path: envFile, quiet: true } : { quiet: true });

export const envFilePath = envFile || '.env';
