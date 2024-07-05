import { getWindow } from "@svgdotjs/svg.js";

export class PathManipulator {
    constructor(el) {
        this.el = el
        this.win = getWindow();
        el.remember('_pathManipulator', this);
    
        this.parameters = {};
        this.lastUpdateCall = null;
        // TODO: What does this do?
        this.p = el.root().node.createSVGPoint();

        this.update = this.update.bind(this)
        this.done = this.done.bind(this)
    }
    
    transformPoint(x, y, m){
        this.p.x = x - (this.offset.x - this.win.scrollX);
        this.p.y = y - (this.offset.y - this.win.scrollY);

        return this.p.matrixTransform(m || this.m);
    }
    
    _extractPosition(event) {
        // Extract a position from a mouse/touch event.
        // Returns { x: .., y: .. }
        return {
            x: event.clientX != null ? event.clientX : event.touches[0].clientX,
            y: event.clientY != null ? event.clientY : event.touches[0].clientY
        }
    }
    
    init(options) {
    
        var _this = this;

        this.stop();

        if (options === 'stop') {
            return;
        }

        this.options = {};

        // Merge options and defaults
        for (var i in this.el.manipulate.defaults) {
            this.options[i] = this.el.manipulate.defaults[i];
            if (typeof options[i] !== 'undefined') {
                this.options[i] = options[i];
            }
        }

        // We listen to the controlpoint event of the pathdeepselect plugin
        this.el.on('controlpoint.pathmanipulator', function(e){ _this.handleControlPointEvent(e); }); // ControlPoint-Moving

        // This call ensures, that the plugin reacts to a change of snapToGrid immediately ... not really needed for us
        this.update();
    }
    
    active(val, options) {
        if (!val) {
            this.stop()
            return
        }

        this.init(options)
    }

    stop(){
        this.el.off('controlpoint.pathmanipulator');
    
        return this;
    }
    
    handleControlPointEvent(event) {
    
        let _this = this;

        this.m = this.el.node.getScreenCTM().inverse();
        this.offset = { x: window.scrollX, y: window.scrollY };

        let txPt = this._extractPosition(event.detail.event);
        let segmentIndex = event.detail.event.target.getAttribute('segmentindex');
        let controlpointType = event.detail.event.target.getAttribute('cpid');
        // Sometimes we need to go higher to get the cpid
        if (controlpointType === null) {
            segmentIndex = event.detail.event.currentTarget.getAttribute('segmentindex');
            controlpointType = event.detail.event.currentTarget.getAttribute('cpid');
        }

        controlpointType = controlpointType.substr(controlpointType.indexOf('type-') + 'type-'.length);

        this.parameters = {
            type: this.el.type, // the type of element
            p: this.transformPoint(txPt.x, txPt.y),
            x: event.detail.x,      // x-position of the mouse when dragging started
            y: event.detail.y,      // y-position of the mouse when dragging started
            box: this.el.bbox(),    // The bounding-box of the element
            rotation: this.el.transform().rotation,  // The current rotation of the element
            segmentIndex: +segmentIndex,
            controlpointType: controlpointType,
            i: event.detail.i,
        };

        // get the segment array
        let segmentsArr = this.el.array().valueOf();
        this.parameters.segmentInfo = [...segmentsArr[segmentIndex]];

        // We also keep the complete array so we are able to manipulate control points in the next segment
        this.parameters.completeOriginalArray = [...segmentsArr];

        // TODO: handle arc_helper_path ... doesn't require a calc method
        
        switch (controlpointType) {
            case 'xy_control_point':
                this.calc = function (diffX, diffY) {
                    // Get the segment array
                    let segmentArr = this.el.array().valueOf();

                    // Changing the moved point in the array
                    switch (segmentArr[this.parameters.segmentIndex][0]) {
                        case 'm':
                        case 'M':
                            segmentArr[this.parameters.segmentIndex][1] = this.parameters.segmentInfo[1] + diffX;
                            segmentArr[this.parameters.segmentIndex][2] = this.parameters.segmentInfo[2] + diffY;
                            // If the next segment has an x1y1, we need to move that as well
                            if (segmentArr.length >= this.parameters.segmentIndex + 1) {
                                var cmd = segmentArr[this.parameters.segmentIndex + 1][0];

                                // TODO: need to do this for all commands that apply
                                if (cmd === 'C') {
                                    segmentArr[this.parameters.segmentIndex + 1][1] = this.parameters.completeOriginalArray[this.parameters.segmentIndex + 1][1] + diffX;
                                    segmentArr[this.parameters.segmentIndex + 1][2] = this.parameters.completeOriginalArray[this.parameters.segmentIndex + 1][2] +  diffY;
                                }
                            }
                            break;
                        case 'l':
                        case 'L':
                        case 't':
                        case 'T':
                            segmentArr[this.parameters.segmentIndex][1] = this.parameters.segmentInfo[1] + diffX;
                            segmentArr[this.parameters.segmentIndex][2] = this.parameters.segmentInfo[2] + diffY;
                            break;
                        case 'v':
                        case 'V':
                            segmentArr[this.parameters.segmentIndex][1] = this.parameters.segmentInfo[1] + diffY;
                            break;
                        case 'h':
                        case 'H':
                            segmentArr[this.parameters.segmentIndex][1] = this.parameters.segmentInfo[0] + diffX;
                            break;
                        case 'c':
                        case 'C':
                            segmentArr[this.parameters.segmentIndex][5] = this.parameters.segmentInfo[5] + diffX;
                            segmentArr[this.parameters.segmentIndex][6] = this.parameters.segmentInfo[6] + diffY;
                            // Also make the x2y2 control point move along
                            segmentArr[this.parameters.segmentIndex][3] = this.parameters.segmentInfo[3] + diffX;
                            segmentArr[this.parameters.segmentIndex][4] = this.parameters.segmentInfo[4] + diffY;
                            break;
                        case 's':
                        case 'S':
                            segmentArr[this.parameters.segmentIndex][3] = this.parameters.segmentInfo[3] + diffX;
                            segmentArr[this.parameters.segmentIndex][4] = this.parameters.segmentInfo[4] + diffY;
                            // Also make the x2y2 control point move along
                            segmentArr[this.parameters.segmentIndex][1] = this.parameters.segmentInfo[1] + diffX;
                            segmentArr[this.parameters.segmentIndex][2] = this.parameters.segmentInfo[2] + diffY;
                            break;
                        case 'q':
                        case 'Q':
                            segmentArr[this.parameters.segmentIndex][3] = this.parameters.segmentInfo[3] + diffX;
                            segmentArr[this.parameters.segmentIndex][4] = this.parameters.segmentInfo[4] + diffY;
                            break;
                        case 'A':
                        case 'a':
                            segmentArr[this.parameters.segmentIndex][6] = this.parameters.segmentInfo[6] + diffX;
                            segmentArr[this.parameters.segmentIndex][7] = this.parameters.segmentInfo[7] + diffY;
                            break;
                        }

                    // And plot the new this.el
                    this.el.plot(segmentArr);
                };
                break;
            case 'x1y1_control_point':
                this.calc = function (diffX, diffY) {
                    // Get the segment array
                    let segmentArr = this.el.array().valueOf();

                    // Is always for cCqQ

                    // Changing the moved point in the array
                    segmentArr[this.parameters.segmentIndex][1] = this.parameters.segmentInfo[1] + diffX;
                    segmentArr[this.parameters.segmentIndex][2] = this.parameters.segmentInfo[2] + diffY;

                    // And plot the new this.el
                    this.el.plot(segmentArr);
                };
                break;
            case 'x2y2_control_point':
                this.calc = function (diffX, diffY) {
                    // Get the segment array
                    let segmentArr = this.el.array().valueOf();

                    // Is always for cC or sS
                    switch (segmentArr[this.parameters.segmentIndex][0]) {
                        case 'c':
                        case 'C':
                            segmentArr[this.parameters.segmentIndex][3] = this.parameters.segmentInfo[3] + diffX;
                            segmentArr[this.parameters.segmentIndex][4] = this.parameters.segmentInfo[4] + diffY;
                            break;
                        case 's':
                        case 'S':
                            segmentArr[this.parameters.segmentIndex][1] = this.parameters.segmentInfo[1] + diffX;
                            segmentArr[this.parameters.segmentIndex][2] = this.parameters.segmentInfo[2] + diffY;
                            break;
                    }

                    // And plot the new this.el
                    this.el.plot(segmentArr);
                };
                break;
            case 'arc_rx_control_point':
                this.calc = function (diffX, diffY) {
                    // Get the segment array
                    let segmentArr = this.el.array().valueOf();
    
                    segmentArr[this.parameters.segmentIndex][1] = this.parameters.segmentInfo[1] - diffX;
    
                    // And plot the new this.el
                    this.el.plot(segmentArr);
                };
                break;
            case 'arc_ry_control_point':
                this.calc = function (diffX, diffY) {
                    // Get the segment array
                    let segmentArr = this.el.array().valueOf();
    
                    segmentArr[this.parameters.segmentIndex][2] = this.parameters.segmentInfo[2] - diffY;

                    // And plot the new this.el
                    this.el.plot(segmentArr);
                };
                break;
            case 'arc_rotation_control_point':
                this.calc = function (diffX, diffY) {

                    let segmentArr = this.el.array().valueOf();

                    if (diffX < 0) diffX = 0;
                    if (diffX > 360) diffX = 360;

                    segmentArr[this.parameters.segmentIndex][3] = diffX;

                    this.el.plot(segmentArr);
                };
                break;
        }

        this.el.fire('pathmanipulationstart', {dx: this.parameters.x, dy: this.parameters.y, event: event});
        // When manipulation starts, we have to register events for...
        // Touches.
        this.el.root().on('touchmove.pathmanipulator', _this.update);
        this.el.root().on('touchend.pathmanipulator', _this.done);
        // and Mouse.
        this.el.root().on('mousemove.pathmanipulator', _this.update);
        this.el.root().on('mouseup.pathmanipulator', _this.done);

    }
    
    // The update-function redraws the element every time the mouse is moving
    update(event) {
    
        if (!event) {
            if (this.lastUpdateCall) {
                this.calc(this.lastUpdateCall[0], this.lastUpdateCall[1]);
            }
            return;
        }
    
        // Calculate the difference between the mouseposition at start and now
        var txPt = this._extractPosition(event);
        var p = this.transformPoint(txPt.x, txPt.y);

        var diffX = p.x - this.parameters.p.x,
            diffY = p.y - this.parameters.p.y;

        this.lastUpdateCall = [diffX, diffY];

        // Calculate the new position and height / width of the element
        this.calc(diffX, diffY);
    
        // Emit an event to say we have changed.
        this.el.fire('pathmanipulationmoving', {dx: diffX, dy: diffY, event: event});
    }
    
    // Is called on mouseup.
    // Removes the update-function from the mousemove event
    done() {
        this.lastUpdateCall = null;
        this.el.root().off('mousemove.pathmanipulator', this.update);
        this.el.root().off('mouseup.pathmanipulator', this.done);
        this.el.root().off('touchmove.pathmanipulator', this.update);
        this.el.root().off('touchend.pathmanipulator', this.done);

        this.el.fire('pathmanipulationdone');
    };
}