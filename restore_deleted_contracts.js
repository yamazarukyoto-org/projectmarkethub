const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: projectId,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
        });
    } else {
        admin.initializeApp({ projectId: projectId });
    }
}

const db = admin.firestore();

const contracts = [
    {
        id: 'ts86wJfO1MuZwNjRcDP5',
        data: {
            jobId: 'QPCsf3FyuaOgNwoQiXMt',
            jobTitle: '復元1',
            clientId: '47JXWi71h1eCbjdUqubMMl0dgh53',
            workerId: 'QsDYvX60TOaeBQQxPnrPrXDPvqW2',
            amount: 5000,
            tax: 500,
            totalAmount: 5500,
            platformFee: 250,
            workerReceiveAmount: 950,
            status: 'completed',
            stripeTransferId: 'tr_3Sipas8IGGSBqsbG1lzkU9j6',
            stripePaymentIntentId: 'restored',
            completedAt: admin.firestore.Timestamp.fromDate(new Date('2025-12-27T05:23:26.000Z')),
            createdAt: admin.firestore.Timestamp.fromDate(new Date('2025-12-27T05:00:00.000Z')),
            restoredAt: admin.firestore.FieldValue.serverTimestamp(),
            restoredReason: 'Stripe送金データから復元'
        }
    },
    {
        id: 'pXxBzO8r6aFf7itietU1',
        data: {
            jobId: 'qnZX1nNK8u8SkRp1TgcN',
            jobTitle: '復元2',
            clientId: '47JXWi71h1eCbjdUqubMMl0dgh53',
            workerId: 'QsDYvX60TOaeBQQxPnrPrXDPvqW2',
            amount: 5000,
            tax: 500,
            totalAmount: 5500,
            platformFee: 250,
            workerReceiveAmount: 950,
            status: 'completed',
            stripeTransferId: 'tr_3SgMUa8IGGSBqsbG03etpgCq',
            stripePaymentIntentId: 'restored',
            completedAt: admin.firestore.Timestamp.fromDate(new Date('2025-12-20T10:13:53.000Z')),
            createdAt: admin.firestore.Timestamp.fromDate(new Date('2025-12-20T10:00:00.000Z')),
            restoredAt: admin.firestore.FieldValue.serverTimestamp(),
            restoredReason: 'Stripe送金データから復元'
        }
    },
    {
        id: 'restored_test_transfer',
        data: {
            jobId: 'test_job',
            jobTitle: '復元3',
            clientId: '47JXWi71h1eCbjdUqubMMl0dgh53',
            workerId: 'QsDYvX60TOaeBQQxPnrPrXDPvqW2',
            amount: 5000,
            tax: 500,
            totalAmount: 5500,
            platformFee: 250,
            workerReceiveAmount: 1222,
            status: 'completed',
            stripeTransferId: 'tr_3SgHpw8IGGSBqsbG1LrSp614',
            stripePaymentIntentId: 'restored',
            completedAt: admin.firestore.Timestamp.fromDate(new Date('2025-12-20T04:34:10.000Z')),
            createdAt: admin.firestore.Timestamp.fromDate(new Date('2025-12-20T04:00:00.000Z')),
            restoredAt: admin.firestore.FieldValue.serverTimestamp(),
            restoredReason: 'Stripe送金データから復元（テスト送金）'
        }
    }
];

async function restore() {
    console.log('Starting restoration...');
    for (const contract of contracts) {
        try {
            await db.collection('contracts').doc(contract.id).set(contract.data);
            console.log('Restored:', contract.id, '- workerReceiveAmount:', contract.data.workerReceiveAmount);
        } catch (error) {
            console.error('Error restoring', contract.id, ':', error.message);
        }
    }
    console.log('---');
    console.log('Restoration complete!');
}

restore().catch(console.error);
