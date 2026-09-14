declare module "ssh2-sftp-client" {
  import type { ConnectConfig } from "ssh2";

  export default class SftpClient {
    connect(config: ConnectConfig): Promise<void>;
    end(): Promise<void>;
    mkdir(remotePath: string, recursive?: boolean): Promise<string>;
    put(localPath: string, remotePath: string): Promise<string>;
  }
}
