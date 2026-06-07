import { proxyActivities } from '@temporalio/workflow';
import { VideoActivity } from '@gitroom/orchestrator/activities/video.activity';

const { generateVideoJob } = proxyActivities<VideoActivity>({
  startToCloseTimeout: '15 minute',
  taskQueue: 'main',
  cancellationType: 'ABANDON',
});

export async function videoGenerationWorkflow(input: {
  jobId: string;
  userId: string;
  orgId: string;
}) {
  await generateVideoJob(input);
}
