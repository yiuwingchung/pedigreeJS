/**
 * PedigreeMaker.js
 * A simple, grid-based JavaScript library for drawing clinical pedigree charts on an HTML canvas.
 *
 * @version 1.4.0 (Fixed single-child connection logic)
 * @author Gemini
 *
 * Core Principles:
 * - Layout is primarily controlled via x/y grid coordinates in the data.
 * - An optional layout optimizer can reorder siblings to prevent line-crossing.
 * - Appearance is controlled via a configuration object.
 * - The library is data-driven; drawing logic is separate from family data.
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
            autoLayoutOptimize: true, // NEW: Automatically reorder siblings to avoid crossovers
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
