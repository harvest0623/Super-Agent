// 待办事项应用主逻辑

class TodoApp {
    constructor() {
        this.todos = [];
        this.filter = 'all';
        this.init();
    }

    init() {
        this.loadTodos();
        this.bindEvents();
        this.render();
    }

    bindEvents() {
        // 添加待办事项
        const addBtn = document.getElementById('add-btn');
        const todoInput = document.getElementById('todo-input');

        addBtn.addEventListener('click', () => this.addTodo());
        todoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTodo();
        });

        // 过滤按钮
        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                filterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.filter = button.dataset.filter;
                this.render();
            });
        });

        // 清除已完成
        const clearCompletedBtn = document.getElementById('clear-completed');
        clearCompletedBtn.addEventListener('click', () => this.clearCompleted());
    }

    addTodo() {
        const todoInput = document.getElementById('todo-input');
        const text = todoInput.value.trim();

        if (text) {
            const todo = {
                id: Date.now(),
                text: text,
                completed: false,
                createdAt: new Date().toISOString()
            };

            this.todos.push(todo);
            this.saveTodos();
            todoInput.value = '';
            this.render();
        }
    }

    toggleTodo(id) {
        this.todos = this.todos.map(todo =>
            todo.id === id ? { ...todo, completed: !todo.completed } : todo
        );
        this.saveTodos();
        this.render();
    }

    deleteTodo(id) {
        this.todos = this.todos.filter(todo => todo.id !== id);
        this.saveTodos();
        this.render();
    }

    clearCompleted() {
        this.todos = this.todos.filter(todo => !todo.completed);
        this.saveTodos();
        this.render();
    }

    loadTodos() {
        try {
            const saved = localStorage.getItem('todos');
            if (saved) {
                this.todos = JSON.parse(saved);
            }
        } catch (err) {
            console.error('加载待办事项失败:', err);
            this.todos = [];
        }
    }

    saveTodos() {
        try {
            localStorage.setItem('todos', JSON.stringify(this.todos));
        } catch (err) {
            console.error('保存待办事项失败:', err);
        }
    }

    getFilteredTodos() {
        switch (this.filter) {
            case 'active':
                return this.todos.filter(todo => !todo.completed);
            case 'completed':
                return this.todos.filter(todo => todo.completed);
            default:
                return this.todos;
        }
    }

    render() {
        const todoList = document.getElementById('todo-list');
        const todoCount = document.getElementById('todo-count');
        const filteredTodos = this.getFilteredTodos();

        // 渲染待办事项列表
        if (filteredTodos.length === 0) {
            todoList.innerHTML = `
            <div class="empty-state">
                <i>📝</i>
                <h3>${this.filter === 'completed' ? '暂无已完成任务' : this.filter === 'active' ? '暂无进行中任务' : '暂无待办事项'}</h3>
                <p>${this.filter === 'all' ? '添加第一个任务开始吧！' : '切换到“全部”视图查看所有任务'}</p>
            </div>
        `;
        } else {
            todoList.innerHTML = filteredTodos.map(todo => `
                <div class="todo-item ${todo.completed ? 'completed' : ''}">
                <div class="todo-content">
                    <input type="checkbox" ${todo.completed ? 'checked' : ''} data-id="${todo.id}" />
                    <span class="todo-text">${this.escapeHtml(todo.text)}</span>
                </div>
                    <button class="delete-btn" data-id="${todo.id}">🗑️</button>
                </div>
            `).join('');
        }

        // 更新统计信息
        const activeCount = this.todos.filter(todo => !todo.completed).length;
        todoCount.textContent = `${activeCount} 项待办`;

        // 绑定复选框事件
        document.querySelectorAll('.todo-item input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.toggleTodo(parseInt(e.target.dataset.id));
            });
        });

        // 绑定删除按钮事件
        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                this.deleteTodo(parseInt(e.target.dataset.id));
            });
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new TodoApp();
});