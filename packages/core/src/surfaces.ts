export function detectSensitiveSurfaces(filePath: string): string[] {
    const surfaces: string[] = [];
    const normalizedPath = `/${filePath.toLowerCase()}`;

    if (filePath.includes('.github/workflows/')) surfaces.push('CI/CD');
    if (filePath.includes('Dockerfile')) surfaces.push('build/runtime');
    if (filePath.includes('helm/') || filePath.includes('k8s/') || filePath.includes('kubernetes/') || filePath.endsWith('deployment.yaml')) surfaces.push('deployment');
    if (normalizedPath.includes('/terraform/') || normalizedPath.endsWith('.tf')) surfaces.push('infrastructure');
    if (normalizedPath.includes('/migrations/') || normalizedPath.includes('/migration/')) surfaces.push('database migration');
    if (/(^|\/)(auth|authentication|authorization|oauth|permissions|security)(\/|\.|-|_)/.test(normalizedPath)) surfaces.push('auth/security');
    if (filePath.endsWith('package.json') || filePath.endsWith('pnpm-lock.yaml') || filePath.endsWith('package-lock.json') || filePath.endsWith('yarn.lock')) surfaces.push('dependency manifest');
    if (filePath.includes('/contracts/') || filePath.includes('/types/') || filePath.includes('-types/') || filePath.endsWith('.types.ts') || filePath.endsWith('.contract.ts')) surfaces.push('shared contract');

    return surfaces;
}
