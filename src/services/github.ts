import { Logger } from "./logger";

export class GitHubActionsService {
  constructor(private readonly logger: Logger) {}

  async dispatchWorkflow(): Promise<void> {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const workflow = process.env.GITHUB_WORKFLOW;
    const ref = process.env.GITHUB_REF ?? "main";

    if (!owner || !repo || !workflow || !process.env.GITHUB_PAT) {
      throw new Error("Missing GitHub workflow configuration.");
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref }),
    });

    if (response.status !== 204) {
      const body = await response.text();
      this.logger.error("GitHub workflow dispatch failed", {
        status: response.status,
        body,
      });
      throw new Error(`GitHub workflow dispatch failed with status ${response.status}`);
    }

    this.logger.info("GitHub workflow dispatched", { owner, repo, workflow, ref });
  }
}
