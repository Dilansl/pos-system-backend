// Not a functional queue — the client's localStorage queue + the sale's
// idempotency key ARE the durable retry mechanism (see offlineQueue.js on the
// frontend). This just logs which sales came through the offline-retry path,
// using the sync_queue table that already existed in the schema for it.
const SyncQueueModel = {
  logSynced: async (client, { actionType, payload }) => {
    await client.query(
      `INSERT INTO sync_queue (action_type, payload, status, synced_at)
       VALUES ($1, $2, 'synced', NOW())`,
      [actionType, JSON.stringify(payload)]
    );
  },
};

export default SyncQueueModel;
