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

async function checkAndFix() {
    const workerId = 'QsDYvX60TOaeBQQxPnrPrXDPvqW2';
    
    // Check restored_test_transfer document
    const doc = await db.collection('contracts').doc('restored_test_transfer').get();
    if (doc.exists) {
        console.log('restored_test_transfer current value:');
        console.log('  workerReceiveAmount:', doc.data().workerReceiveAmount);
    } else {
        console.log('restored_test_transfer not found!');
    }
    
    // Get all completed contracts for this worker
    const snap = await db.collection('contracts')
        .where('workerId', '==', workerId)
        .where('status', '==', 'completed')
        .get();
    
    let total = 0;
    console.log('\nAll completed contracts:');
    snap.forEach(d => {
        const data = d.data();
        console.log(`  ${d.id}: ¥${data.workerReceiveAmount} (${data.jobTitle || 'no title'})`);
        total += data.workerReceiveAmount || 0;
    });
    
    console.log('\n---');
    console.log('Total contracts:', snap.size);
    console.log('Total workerReceiveAmount:', total);
    console.log('Expected (Stripe balance):', 201812);
    console.log('Difference:', total - 201812);
    
    // If still 201867, we need to fix
    if (total === 201867) {
        console.log('\n⚠️ Need to fix: updating restored_test_transfer from 1222 to 1167');
        await db.collection('contracts').doc('restored_test_transfer').update({
            workerReceiveAmount: 1167
        });
        console.log('✅ Fixed! New total should be 201812');
    } else if (total === 201812) {
        console.log('\n✅ Already correct!');
    }
}

checkAndFix().catch(console.error);
