// ========================================
// UNDO/REDO SYSTEM

class Command {
    constructor(name, executeFunc, undoFunc) {
        this.name = name;
        this.executeFunc = executeFunc;
        this.undoFunc = undoFunc;
        this.timestamp = Date.now();
    }

    execute() {
        return this.executeFunc();
    }

    undo() {
        return this.undoFunc();
    }
}

class UndoManager {
    constructor(maxHistory = 100) {
        this.history = [];
        this.currentIndex = -1;
        this.maxHistory = maxHistory;
        this.updateUI();
    }

    execute(command) {
        // Remove any commands after current index (they've been undone)
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }

        // Execute the command
        command.execute();

        // Add to history
        this.history.push(command);
        this.currentIndex++;

        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
            this.currentIndex--;
        }

        this.updateUI();
        return command;
    }

    undo() {
        if (!this.canUndo()) {
            return false;
        }

        const command = this.history[this.currentIndex];
        command.undo();
        this.currentIndex--;
        
        this.updateUI();
        return true;
    }

    redo() {
        if (!this.canRedo()) {
            return false;
        }

        this.currentIndex++;
        const command = this.history[this.currentIndex];
        command.execute();
        
        this.updateUI();
        return true;
    }

    canUndo() {
        return this.currentIndex >= 0;
    }

    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }

    clear() {
        this.history = [];
        this.currentIndex = -1;
        this.updateUI();
    }

    getHistory() {
        return this.history.map((cmd, index) => ({
            name: cmd.name,
            timestamp: cmd.timestamp,
            isCurrent: index === this.currentIndex
        }));
    }

    updateUI() {
        // Update undo/redo button states
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        
        if (undoBtn) {
            undoBtn.disabled = !this.canUndo();
            undoBtn.style.opacity = this.canUndo() ? '1' : '0.5';
            undoBtn.title = this.canUndo() 
                ? `Undo: ${this.history[this.currentIndex].name}` 
                : 'Nothing to undo';
        }
        
        if (redoBtn) {
            redoBtn.disabled = !this.canRedo();
            redoBtn.style.opacity = this.canRedo() ? '1' : '0.5';
            redoBtn.title = this.canRedo() 
                ? `Redo: ${this.history[this.currentIndex + 1].name}` 
                : 'Nothing to redo';
        }
    }
}

// Global instance
window.undoManager = new UndoManager();

// Make Command class globally accessible
window.Command = Command;

// Helper function to create commands
window.createCommand = (name, executeFunc, undoFunc) => {
    return new Command(name, executeFunc, undoFunc);
};

// Example usage for arrangement operations:
/*
// Add clip
window.undoManager.execute(createCommand(
    'Add Clip',
    () => {
        // Add clip code
        const clip = { ... };
        arrangementState.clips.push(clip);
        renderTimeline();
        return clip;
    },
    () => {
        // Remove clip code
        arrangementState.clips.pop();
        renderTimeline();
    }
));

// Delete clip
window.undoManager.execute(createCommand(
    'Delete Clip',
    () => {
        const clip = arrangementState.clips[index];
        arrangementState.clips.splice(index, 1);
        renderTimeline();
        return clip;
    },
    () => {
        arrangementState.clips.splice(index, 0, clip);
        renderTimeline();
    }
));
*/
