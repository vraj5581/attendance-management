
import { db } from './src/firebase.js';
import { collection, getDocs, setDoc, deleteDoc, doc } from 'firebase/firestore';

async function migrateCompaniesToAdmins() {
  console.log('Starting migration: companies -> admins...');
  
  try {
    const companiesRef = collection(db, 'companies');
    const querySnapshot = await getDocs(companiesRef);
    
    if (querySnapshot.empty) {
      console.log('No companies found to migrate.');
      return;
    }
    
    console.log(`Found ${querySnapshot.size} documents to migrate.`);
    
    for (const companyDoc of querySnapshot.docs) {
      const data = companyDoc.data();
      const id = companyDoc.id;
      
      console.log(`Migrating company: ${data.companyName || data.adminName || id}...`);
      
      // 1. Create document in 'admins' collection with same ID
      await setDoc(doc(db, 'admins', id), data);
      
      // 2. Delete document from 'companies' collection
      await deleteDoc(doc(db, 'companies', id));
      
      console.log(`Successfully migrated ${id}.`);
    }
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrateCompaniesToAdmins();
