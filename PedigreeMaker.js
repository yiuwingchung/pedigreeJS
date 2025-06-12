/**
 * PedigreeMaker.js
 * A simple, grid-based JavaScript library for drawing clinical pedigree charts on an HTML canvas.
 *
 * @version 2.0.0 (Added interactive drag-and-drop functionality)
 * @author Enhanced version with interactivity
 *
 * Core Principles:
 * - Layout is primarily controlled via x/y grid coordinates in the data.
 * - An optional layout optimizer can reorder siblings to prevent line-crossing.
 * - Appearance is controlled via a configuration object.
 * - The library is data-driven; drawing logic is separate from family data.
 * - NEW: Interactive drag-and-drop functionality for repositioning nodes.
 */

class PedigreeMaker {
    /**
     * Initializes the pedigree chart.
     * @param {string} canvasId The ID of the HTML canvas element to draw on.
     * @param {Array<Object>} pedigreeData An array of objects, where each object represents an individual.
     * @param {Object} [options] A configuration object to customize the appearance.
     */
    constructor(canvasId, pedigreeData, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas element with ID "${canvasId}" not found.`);
        }
        this.ctx = this.canvas.getContext('2d');
        
        // Create a deep copy of the data to allow for modifications by the optimizer
        this.data = JSON.parse(JSON.stringify(pedigreeData));
        this.originalData = JSON.parse(JSON.stringify(pedigreeData)); // Store original positions
        
        const defaults = {
            nodeWidth: 50,
            nodeHeight: 50,
            hSpacing: 100,
            vSpacing: 120,
            lineWidth: 2,
            lineColor: '#333',
            font: '12px Arial',
            probandArrowSize: 15,
            padding: { top: 50, left: 50 },
            autoLayoutOptimize: true,
            interactive: true, // NEW: Enable/disable interactivity
            phenotypes: {
                'default_affected': {
                    facecolor: '#a9a9a9',
                    description: 'Affected'
                }
            }
        };

        this.config = Object.assign({}, defaults, options);
        this.config.padding = Object.assign({}, defaults.padding, options.padding);
        this.config.phenotypes = Object.assign({}, defaults.phenotypes, options.phenotypes);
        this.nodeCoords = {};
        
        // NEW: Interactive properties
        this.isDragging = false;
        this.dragTarget = null;
        this.dragOffset = { x: 0, y: 0 };
        this.lastMousePos = { x: 0, y: 0 };
        
        // NEW: Setup interactivity if enabled
        if (this.config.interactive) {
            this._setupInteractivity();
        }
    }

    /**
     * NEW: Setup mouse and touch event listeners for interactivity
     * @private
     */
    _setupInteractivity() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this._handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this._handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this._handleMouseUp(e));
        
        // Touch events for mobile support
        this.canvas.addEventListener('touchstart', (e) => this._handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this._handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this._handleTouchEnd(e));
        
        // Prevent context menu
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Set initial cursor style
        this.canvas.style.cursor = 'default';
    }

    /**
     * NEW: Get mouse position relative to canvas
     * @private
     */
    _getMousePosition(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    /**
     * NEW: Get touch position relative to canvas
     * @private
     */
    _getTouchPosition(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.touches[0].clientX - rect.left,
            y: event.touches[0].clientY - rect.top
        };
    }

    /**
     * NEW: Find which node (if any) is at the given position
     * @private
     */
    _findNodeAtPosition(x, y) {
        for (const personId in this.nodeCoords) {
            const coord = this.nodeCoords[personId];
            const dx = x - coord.x;
            const dy = y - coord.y;
            
            // Check if point is within node bounds (circular for females, rectangular for males)
            const person = this.data.find(p => p.id === personId);
            let isInside = false;
            
            if (person.sex === 'F') {
                // Circle detection
                const distance = Math.sqrt(dx * dx + dy * dy);
                isInside = distance <= this.config.nodeWidth / 2;
            } else {
                // Rectangle detection
                isInside = Math.abs(dx) <= this.config.nodeWidth / 2 && 
                          Math.abs(dy) <= this.config.nodeHeight / 2;
            }
            
            if (isInside) {
                return person;
            }
        }
        return null;
    }

    /**
     * NEW: Handle mouse down events
     * @private
     */
    _handleMouseDown(event) {
        const mousePos = this._getMousePosition(event);
        const clickedNode = this._findNodeAtPosition(mousePos.x, mousePos.y);
        
        if (clickedNode) {
            this.isDragging = true;
            this.dragTarget = clickedNode;
            
            const nodeCoord = this.nodeCoords[clickedNode.id];
            this.dragOffset = {
                x: mousePos.x - nodeCoord.x,
                y: mousePos.y - nodeCoord.y
            };
            
            this.canvas.style.cursor = 'grabbing';
            event.preventDefault();
        }
    }

    /**
     * NEW: Handle mouse move events
     * @private
     */
    _handleMouseMove(event) {
        const mousePos = this._getMousePosition(event);
        this.lastMousePos = mousePos;
        
        if (this.isDragging && this.dragTarget) {
            // Calculate new position
            const newPixelX = mousePos.x - this.dragOffset.x;
            const newPixelY = mousePos.y - this.dragOffset.y;
            
            // Convert pixel coordinates back to grid coordinates
            const newGridX = Math.round((newPixelX - this.config.padding.left) / this.config.hSpacing);
            const newGridY = Math.round((newPixelY - this.config.padding.top) / this.config.vSpacing);
            
            // Ensure coordinates are not negative
            this.dragTarget.pos.x = Math.max(0, newGridX);
            this.dragTarget.pos.y = Math.max(0, newGridY);
            
            // Re-render the pedigree
            this.render();
        } else {
            // Update cursor based on what's under the mouse
            const hoveredNode = this._findNodeAtPosition(mousePos.x, mousePos.y);
            this.canvas.style.cursor = hoveredNode ? 'grab' : 'default';
        }
    }

    /**
     * NEW: Handle mouse up events
     * @private
     */
    _handleMouseUp(event) {
        if (this.isDragging) {
            this.isDragging = false;
            this.dragTarget = null;
            this.canvas.style.cursor = 'default';
            
            // Optional: Trigger a callback when a node is moved
            if (this.config.onNodeMoved && typeof this.config.onNodeMoved === 'function') {
                this.config.onNodeMoved(this.data);
            }
        }
    }

    /**
     * NEW: Handle touch start events
     * @private
     */
    _handleTouchStart(event) {
        event.preventDefault();
        const touchPos = this._getTouchPosition(event);
        this._handleMouseDown({
            clientX: touchPos.x + this.canvas.getBoundingClientRect().left,
            clientY: touchPos.y + this.canvas.getBoundingClientRect().top,
            preventDefault: () => {}
        });
    }

    /**
     * NEW: Handle touch move events
     * @private
     */
    _handleTouchMove(event) {
        event.preventDefault();
        const touchPos = this._getTouchPosition(event);
        this._handleMouseMove({
            clientX: touchPos.x + this.canvas.getBoundingClientRect().left,
            clientY: touchPos.y + this.canvas.getBoundingClientRect().top
        });
    }

    /**
     * NEW: Handle touch end events
     * @private
     */
    _handleTouchEnd(event) {
        event.preventDefault();
        this._handleMouseUp(event);
    }

    /**
     * NEW: Reset all nodes to their original positions
     */
    resetPositions() {
        this.data = JSON.parse(JSON.stringify(this.originalData));
        this.render();
    }

    /**
     * NEW: Toggle the auto-layout optimizer
     */
    toggleAutoLayoutOptimize() {
        this.config.autoLayoutOptimize = !this.config.autoLayoutOptimize;
        this.render();
        return this.config.autoLayoutOptimize;
    }

    /**
     * NEW: Export the canvas as an image
     */
    exportAsImage(filename = 'pedigree.png') {
        const link = document.createElement('a');
        link.download = filename;
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }

    /**
     * NEW: Get the current data (useful after user interactions)
     */
    getData() {
        return JSON.parse(JSON.stringify(this.data));
    }

    /**
     * NEW: Update the data programmatically
     */
    setData(newData) {
        this.data = JSON.parse(JSON.stringify(newData));
        this.render();
    }

    _getPixelCoords(gridX, gridY) {
        return {
            x: gridX * this.config.hSpacing + this.config.padding.left,
            y: gridY * this.config.vSpacing + this.config.padding.top
        };
    }
    
    _optimizeLayout() {
        if (!this.config.autoLayoutOptimize) return;

        this.data.forEach(person => {
            if (person.mate) {
                const partner = this.data.find(p => p.id === person.mate);
                if (!partner) return;

                const lineStartX = Math.min(person.pos.x, partner.pos.x);
                const lineEndX = Math.max(person.pos.x, partner.pos.x);

                this.data.forEach(potentialObstacle => {
                    if (potentialObstacle.id !== person.id && potentialObstacle.id !== partner.id && potentialObstacle.pos.y === person.pos.y) {
                        if (potentialObstacle.pos.x > lineStartX && potentialObstacle.pos.x < lineEndX) {
                            const areSiblings = JSON.stringify(person.parents?.sort()) === JSON.stringify(potentialObstacle.parents?.sort()) && person.parents !== undefined;
                            
                            if (areSiblings) {
                                const personOriginalX = person.pos.x;
                                person.pos.x = potentialObstacle.pos.x;
                                potentialObstacle.pos.x = personOriginalX;
                            }
                        }
                    }
                });
            }
        });
    }

    _drawNode(person) {
        const { x, y } = this._getPixelCoords(person.pos.x, person.pos.y);
        this.nodeCoords[person.id] = { x, y };

        // NEW: Add visual feedback for dragged node
        if (this.dragTarget && this.dragTarget.id === person.id) {
            this.ctx.shadowColor = 'rgba(0, 123, 255, 0.5)';
            this.ctx.shadowBlur = 10;
        }

        if (person.phenotypes && person.phenotypes.length > 0) {
            this._drawPhenotypeFill(person, x, y);
        }

        this.ctx.beginPath();
        this.ctx.strokeStyle = this.config.lineColor;
        this.ctx.lineWidth = this.config.lineWidth;

        if (person.sex === 'M') {
            this.ctx.rect(x - this.config.nodeWidth / 2, y - this.config.nodeHeight / 2, this.config.nodeWidth, this.config.nodeHeight);
        } else if (person.sex === 'F') {
            this.ctx.arc(x, y, this.config.nodeWidth / 2, 0, 2 * Math.PI);
        }
        this.ctx.stroke();

        // Reset shadow
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;

        if (person.isProband) {
            const arrowX = x - this.config.nodeWidth / 2 - 5;
            this.ctx.beginPath();
            this.ctx.moveTo(arrowX - this.config.probandArrowSize, y);
            this.ctx.lineTo(arrowX, y);
            this.ctx.moveTo(arrowX, y);
            this.ctx.lineTo(arrowX - 5, y - 5);
            this.ctx.moveTo(arrowX, y);
            this.ctx.lineTo(arrowX - 5, y + 5);
            this.ctx.stroke();
        }
        
        this._drawText(person.name, x, y + this.config.nodeHeight / 2 + 5);
    }
    
    _drawPhenotypeFill(person, x, y) {
        const phenotypes = person.phenotypes;
        const numPhenotypes = phenotypes.length;
        if (numPhenotypes === 0) return;

        if (person.sex === 'F') { // Pie chart for females
            const radius = this.config.nodeWidth / 2;
            const angleStep = (2 * Math.PI) / numPhenotypes;

            phenotypes.forEach((phenoId, i) => {
                const style = this.config.phenotypes[phenoId] || this.config.phenotypes['default_affected'];
                if (style.facecolor) {
                    this.ctx.fillStyle = style.facecolor;
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, y);
                    this.ctx.arc(x, y, radius, angleStep * i, angleStep * (i + 1));
                    this.ctx.closePath();
                    this.ctx.fill();
                }
            });
        } else if (person.sex === 'M') { // Vertical bars for males
            const barWidth = this.config.nodeWidth / numPhenotypes;
            const startX = x - this.config.nodeWidth / 2;
            
            phenotypes.forEach((phenoId, i) => {
                 const style = this.config.phenotypes[phenoId] || this.config.phenotypes['default_affected'];
                 if (style.facecolor) {
                    this.ctx.fillStyle = style.facecolor;
                    this.ctx.fillRect(startX + i * barWidth, y - this.config.nodeHeight / 2, barWidth, this.config.nodeHeight);
                 }
            });
        }
    }

    _drawText(text, x, y) {
        this.ctx.fillStyle = this.config.lineColor;
        this.ctx.font = this.config.font;
        this.ctx.textAlign = 'center';
        const lines = text.split('\n');
        lines.forEach((line, i) => {
            this.ctx.fillText(line, x, y + 10 + (i * 14));
        });
    }

    _drawConnections() {
        this.ctx.strokeStyle = this.config.lineColor;
        this.ctx.lineWidth = this.config.lineWidth;
        const drawnPartnerships = new Set();
        const childrenByParents = {};

        this.data.forEach(person => {
            if (person.parents && person.parents.length === 2) {
                const parentKey = person.parents.sort().join('-');
                if (!childrenByParents[parentKey]) {
                    childrenByParents[parentKey] = [];
                }
                childrenByParents[parentKey].push(person.id);
            }
        });

        this.data.forEach(person => {
            if (person.mate) {
                const partnershipKey = [person.id, person.mate].sort().join('-');
                if (!drawnPartnerships.has(partnershipKey)) {
                    const p1 = this.nodeCoords[person.id];
                    const p2 = this.nodeCoords[person.mate];
                    if (p1 && p2) {
                        const leftNode = p1.x < p2.x ? p1 : p2;
                        const rightNode = p1.x < p2.x ? p2 : p1;
                        
                        this.ctx.beginPath();
                        this.ctx.moveTo(leftNode.x + this.config.nodeWidth / 2, leftNode.y);
                        this.ctx.lineTo(rightNode.x - this.config.nodeWidth / 2, rightNode.y);
                        this.ctx.stroke();
                        drawnPartnerships.add(partnershipKey);

                        if (childrenByParents[partnershipKey]) {
                            const midX = (p1.x + p2.x) / 2;
                            this.ctx.beginPath();
                            this.ctx.moveTo(midX, p1.y);
                            this.ctx.lineTo(midX, p1.y + this.config.vSpacing / 2);
                            this.ctx.stroke();
                        }
                    }
                }
            }
        });
        
        for (const parentKey in childrenByParents) {
            const childrenIds = childrenByParents[parentKey];
            const parentIds = parentKey.split('-');
            const p1 = this.nodeCoords[parentIds[0]];
            const p2 = this.nodeCoords[parentIds[1]];
            
            const sibshipY = p1.y + this.config.vSpacing / 2;
            const childCoords = childrenIds.map(id => this.nodeCoords[id]);
            
            const firstChildX = Math.min(...childCoords.map(c => c.x));
            const lastChildX = Math.max(...childCoords.map(c => c.x));

            // BUG FIX: Draw horizontal line connecting parent dropdown to children
            const parentMidX = (p1.x + p2.x) / 2;
            const sibshipLineStart = Math.min(parentMidX, firstChildX);
            const sibshipLineEnd = Math.max(parentMidX, lastChildX);

            this.ctx.beginPath();
            this.ctx.moveTo(sibshipLineStart, sibshipY);
            this.ctx.lineTo(sibshipLineEnd, sibshipY);
            this.ctx.stroke();
            
            // Draw vertical lines from sibship line to each child
            childCoords.forEach(child => {
                this.ctx.beginPath();
                this.ctx.moveTo(child.x, sibshipY);
                this.ctx.lineTo(child.x, child.y - this.config.nodeHeight / 2);
                this.ctx.stroke();
            });
        }
    }

    render() {
        this._optimizeLayout();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.data.forEach(person => this._drawNode(person));
        this._drawConnections();
    }
    
    drawLegend(legendId) {
        const legendContainer = document.getElementById(legendId);
        if (!legendContainer) return;
        
        let html = '<h3>Legend</h3>';
        html += `
            <div style="display: flex; align-items: center; margin-bottom: 5px;">
                <span style="display: inline-block; width: 20px; height: 20px; border: 1px solid black; margin-right: 10px;"></span> Male
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 5px;">
                <span style="display: inline-block; width: 20px; height: 20px; border: 1px solid black; border-radius: 50%; margin-right: 10px;"></span> Female
            </div>
        `;

        for (const key in this.config.phenotypes) {
            const phenotype = this.config.phenotypes[key];
            const style = `background-color: ${phenotype.facecolor || '#fff'};`;
            html += `
                 <div style="display: flex; align-items: center; margin-bottom: 5px;">
                    <span style="display: inline-block; width: 20px; height: 20px; border: 1px solid black; margin-right: 10px; ${style}"></span> ${phenotype.description}
                </div>
            `;
        }
        legendContainer.innerHTML = html;
    }
}