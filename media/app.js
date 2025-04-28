(function() {
  const vscode = acquireVsCodeApi();

  const notesTextarea = document.getElementById('notes');
  const todosUl = document.getElementById('todos');
  const newTodoInput = document.getElementById('newTodo');

  function saveData() {
    const notes = notesTextarea.value;
    const todos = Array.from(todosUl.children).map(li => ({
      text: li.innerText.replace('✅ ', '').trim(),
      done: li.classList.contains('done')
    }));
    vscode.postMessage({ notes, todos });
  }

  window.addEventListener('message', event => {
    const message = event.data;
    if (message.notes !== undefined) {
      notesTextarea.value = message.notes;
    }
    if (Array.isArray(message.todos)) {
      todosUl.innerHTML = '';
      for (const todo of message.todos) {
        addTodoItem(todo.text, todo.done);
      }
    }
  });

  document.getElementById('newTodo').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addTodo();
    }
  });

  window.addTodo = function() {
    const value = newTodoInput.value.trim();
    if (value) {
      addTodoItem(value);
      newTodoInput.value = '';
      saveData();
    }
  };

  function addTodoItem(text, done = false) {
    const li = document.createElement('li');
    li.textContent = text;
    if (done) {
      li.classList.add('done');
      li.textContent = `✅ ${text}`;
    }
    li.style.cursor = 'pointer';
    li.addEventListener('click', () => {
      li.classList.toggle('done');
      if (li.classList.contains('done')) {
        li.textContent = `✅ ${text}`;
      } else {
        li.textContent = text;
      }
      saveData();
    });
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      li.remove();
      saveData();
    });
    todosUl.appendChild(li);
  }

  notesTextarea.addEventListener('input', () => {
    saveData();
  });

})();

