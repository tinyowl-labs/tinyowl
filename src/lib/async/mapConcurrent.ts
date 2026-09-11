/** Preserve input order while limiting in-flight work, including parsing. */
export async function mapConcurrent<T, R>(
    values: readonly T[],
    concurrency: number,
    work: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(values.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(values.length, Math.max(1, concurrency)) }, async () => {
        while (next < values.length) {
            const index = next++;
            results[index] = await work(values[index]!, index);
        }
    }));
    return results;
}
