export function isCurrentJob(messageJobId: number, currentJobId: number): boolean {
  return messageJobId === currentJobId;
}
