import { User, createUser } from '../models/user.js';

export class UserService {
  private users: User[] = [];

  add(id: number, name: string, email: string): User {
    const user = createUser(id, name, email);
    this.users.push(user);
    return user;
  }

  findById(id: number): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  getAll(): User[] {
    return [...this.users];
  }
}
