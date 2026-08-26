import { handleRequest, type Env, type WorkerExecutionContext } from './app';

export default {
  fetch(request: Request, env: Env, context: WorkerExecutionContext): Promise<Response> {
    return handleRequest(request, env, context);
  },
};
