import { UserService } from './services/user-service.js';

const service = new UserService();
service.add(1, 'Alice', 'alice@example.com');
service.add(2, 'Bob', 'bob@example.com');

console.log(service.getAll());
