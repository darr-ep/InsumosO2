import PocketBase from 'pocketbase';

const pb = new PocketBase('https://api.o2insumos.com');
pb.autoCancellation(false);

async function testAllUsers() {
  await pb.collection('users').authWithPassword('7751241389', '12345678');
  const users = await pb.collection('users').getList(1, 20);
  console.log('Users in DB:', users.items.map(u => ({ id: u.id, name: u.name, phone: u.phone })));

  // Test creating a rental, updating it, and deleting it as each user
  for (const user of users.items) {
    console.log(`\nTesting as user ${user.name} (${user.phone})...`);
    const userPb = new PocketBase('https://api.o2insumos.com');
    userPb.autoCancellation(false);
    try {
      await userPb.collection('users').authWithPassword(user.phone, '12345678');
      console.log('  Auth OK');

      // 1. Create a customer
      const cust = await userPb.collection('customers').create({
        name: 'Test Customer',
        phone: '1234567890',
      });
      console.log('  Customer created:', cust.id);

      // 2. Create a rental
      const rental = await userPb.collection('rentals').create({
        customer_id: cust.id,
        initial_rent_amount: 100,
        deposit_amount: 50,
      });
      console.log('  Rental created:', rental.folio, rental.id);

      // 3. Create a rental item
      const item = await userPb.collection('rental_items').create({
        rental_id: rental.id,
        item_type: 'concentrator',
        quantity: 1,
      });
      console.log('  Item created:', item.id);

      // 4. Create a payment
      const payment = await userPb.collection('payments').create({
        rental_id: rental.id,
        amount: 50,
        payment_type: 'deposit',
      });
      console.log('  Payment created:', payment.id);

      // 5. Update rental
      const updated = await userPb.collection('rentals').update(rental.id, {
        initial_rent_amount: 150,
        deposit_amount: 50,
      });
      console.log('  Rental updated:', updated.folio);

      // 6. Delete item
      await userPb.collection('rental_items').delete(item.id);
      console.log('  Item deleted');

      // 7. Delete payment
      await userPb.collection('payments').delete(payment.id);
      console.log('  Payment deleted');

      // 8. Delete rental
      await userPb.collection('rentals').delete(rental.id);
      console.log('  Rental deleted');

      // 9. Delete customer
      await userPb.collection('customers').delete(cust.id);
      console.log('  Customer deleted');

      console.log(`  ALL CRUD ACTIONS WORKED FOR ${user.name}!`);
    } catch (err) {
      console.error(`  FAILED for user ${user.name}:`, err.status, err.message, err.response);
    }
  }
}

testAllUsers().catch(console.error);
