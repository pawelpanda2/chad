import { getItem, invokeSharp } from './sharp-runner';

async function runDemo() {
  console.log('=== Content Provider TypeScript Runner Demo ===\n');

  // Demo 1: Using the convenience getItem wrapper
  console.log('Demo 1: getItem("root", "")');
  try {
    const result = await getItem('root', '');
    console.log('Result:', result);
  } catch (error: any) {
    console.error('Error in Demo 1:', error.message);
  }

  console.log('\n---\n');

  // Demo 2: Using the generic invokeSharp with explicit args
  console.log('Demo 2: invokeSharp(["IRepoService", "IItemWorker", "GetItem", "root", ""])');
  try {
    const result = await invokeSharp([
      'IRepoService',
      'IItemWorker',
      'GetItem',
      'root',
      ''
    ]);
    console.log('Result:', result);
  } catch (error: any) {
    console.error('Error in Demo 2:', error.message);
  }

  console.log('\n=== Demo Complete ===');
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}

export { runDemo };