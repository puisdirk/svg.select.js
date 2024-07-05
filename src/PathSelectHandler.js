import { G, getWindow, List, Matrix } from '@svgdotjs/svg.js'
import { getMoseDownFunc, transformPoint } from './utils'

export class PathSelectHandler {
  constructor(el) {
    this.el = el
    el.remember('_pathSelectHandler', this)
    this.options = {};

    // TODO: do we still need this now that we switched to css classes?
    this.defaults = {
    }

    // Our different types of control point
    this.XY_CP = 'xy_control_point';
    this.X1Y1_CP = 'x1y1_control_point';
    this.X2Y2_CP = 'x2y2_control_point';
    this.STALK = 'control_point_stalk';
    this.REFLECTED_CP = 'reflected_control_point'
    this.REFLECTED_STALK = 'reflected_stalk'
    this.ARC_HELPER_PATH = 'arc_helper_path';
    this.ARC_RX_CP = 'arc_rx_control_point';
    this.ARC_RY_CP = 'arc_ry_control_point';
    this.ARC_ROTATION_CP = 'arc_rotation_control_point';

    this.mutationHandler = this.mutationHandler.bind(this)
    const win = getWindow()
    this.observer = new win.MutationObserver(this.mutationHandler)
  }

  init(options) {
    // Merging the defaults and the options-object together
    for (var i in this.defaults) {
        this.options[i] = this.defaults[i];
        if (options[i] !== undefined) {
            this.options[i] = options[i];
        }
    }
    
    // selection controls are added in a group to the parent
    this.selection = this.el.parent().group();
    this.selection.list = (this.selection.list || new List());

    // offset selection controls
    this.bbox = this.el.bbox();
    this.selection.matrix(new Matrix(this.el).translate(this.bbox.x, this.bbox.y));

    // create and show the selection controls
    this.createAndDrawControlPoints()

    this.observer.observe(this.el.node, { attributes: true })
  }

  active(val, options) {
    // Disable selection
    if (!val) {
        this.selection && this.selection.clear().remove()
        this.selection && this.observer.disconnect()
        return
    }

    // Enable selection
    this.init(options)
  }

  createAndDrawControlPoints() {
    // only create once
    if (this.selection.list.length > 0) {
        return
    }

    this.drawControlPoints()
  }

  drawControlPoints() {
    let cpoints = this.getPathControlPoints()
    let _that = this;

    for (var i = 0, len = cpoints.length; i < len; ++i) {

        // Some control points fire an event
        var curriedEvent = (function (k) {
            return function (ev) {
                ev = ev || window.event;
                ev.preventDefault ? ev.preventDefault() : ev.returnValue = false;
                ev.stopPropagation();

                var x = ev.pageX || ev.touches[0].pageX;
                var y = ev.pageY || ev.touches[0].pageY;
                _that.el.fire('controlpoint', {x: x, y: y, i: k, event: ev});
            };
        })(i);

        // add every point to the list and
        // add css-classes and a touchstart-event which fires our event for moving points
        // We add attributes like segmentindex, cptype, etc directly on the dom node
        var controlPoint = this.drawPathSelectionControl(cpoints[i]);
        controlPoint
            .addClass(cpoints[i].type)
            .attr('segmentindex', cpoints[i].segmentIndex)
            .attr('cpid', cpoints[i].cpid);
        if (cpoints[i].fires === true) {
            controlPoint.on('touchstart', curriedEvent).on('mousedown', curriedEvent);
        }

        this.selection.list.push(controlPoint);
    }
  }

  getPathControlPoints() {
    let _that = this
    let controlPoints = [];

    // Store the previous segment to decide what to do for smooth curves
    let prevSegment = null;
    let segmentIndex = 0;

    let segments = this.getEnrichedPathArray();

    segments.forEach(function (segment) {

        // Every type has one location control point on the end point
        controlPoints.push({
            type: _that.XY_CP,
            x: segment.x,
            y: segment.y,
            segmentIndex: segmentIndex,
            fires: true
        });

        // Bezier curves have two stalked control points. One for the x1,y1 
        // sprouting out from x0,y0; and one for x2,y2 sprouting from x,y
        if (segment.command === 'curveto') {
            controlPoints.push({
                type: _that.X1Y1_CP,
                x1: segment.x1,
                y1: segment.y1,
                segmentIndex: segmentIndex,
                fires: true
            });
            controlPoints.push({
                type: _that.STALK,
                // Note: stalks and arc helpers get a subtype to create unique ids
                subtype: 'x1y1',
                xfrom: segment.x1,
                yfrom: segment.y1,
                xto: segment.x0,
                yto: segment.y0,
                segmentIndex: segmentIndex,
                fires: false
            });
            controlPoints.push({
                type: _that.X2Y2_CP,
                x2: segment.x2,
                y2: segment.y2,
                segmentIndex: segmentIndex,
                fires: true
            });
            controlPoints.push({
                type: _that.STALK,
                subtype: 'x2y2',
                xfrom: segment.x2,
                yfrom: segment.y2,
                xto: segment.x,
                yto: segment.y,
                segmentIndex: segmentIndex,
                fires: false
            });
        }

        if (segment.command === 'smooth curveto') {
            // The end-controlpoint
            controlPoints.push({
                type: _that.X2Y2_CP,
                x2: segment.x2,
                y2: segment.y2,
                segmentIndex: segmentIndex,
                fires: true
            });
            controlPoints.push({
                type: _that.STALK,
                subtype: 'x2y2',
                xfrom: segment.x2,
                yfrom: segment.y2,
                xto: segment.x,
                yto: segment.y,
                segmentIndex: segmentIndex,
                fires: false
            });

            // If the smooth curve is preceded by another smooth curve or a curve, we draw a reflected 
            // stalked control point as first control point
            if (prevSegment !== null && (prevSegment.command === 'curveto' || prevSegment.command === 'smooth curveto')) {
                controlPoints.push({
                    type: _that.REFLECTED_CP,
                    x: prevSegment.x + (prevSegment.x - prevSegment.x2),
                    y: prevSegment.y + (prevSegment.y - prevSegment.y2),
                    segmentIndex: segmentIndex,
                    fires: false    
                });
                controlPoints.push({
                    type: _that.REFLECTED_STALK,
                    xfrom: prevSegment.x + (prevSegment.x - prevSegment.x2),
                    yfrom: prevSegment.y + (prevSegment.y - prevSegment.y2),
                    xto: segment.x0,
                    yto: segment.y0,
                    segmentIndex: segmentIndex,
                    fires: false
                });
            }
            // Otherwise, no control point is drawn as it is assumed to be the x,y of the previous segment
        }

        if (segment.command === 'quadratic curveto') {
            // A double-stalked control point
            controlPoints.push({
                type: _that.X1Y1_CP,
                x1: segment.x1,
                y1: segment.y1,
                segmentIndex: segmentIndex,
                fires: true
            });
            controlPoints.push({
                type: _that.STALK,
                subtype: 'x1y1left',
                xfrom: segment.x1,
                yfrom: segment.y1,
                xto: segment.x0,
                yto: segment.y0,
                segmentIndex: segmentIndex,
                fires: false
            });
            controlPoints.push({
                type: _that.STALK,
                subtype: 'x1y1right',
                xfrom: segment.x1,
                yfrom: segment.y1,
                xto: segment.x,
                yto: segment.y,
                segmentIndex: segmentIndex,
                fires: false
            });
        }

        if (segment.command === 'smooth quadratic curveto') {
            // If the smooth quadratic curve is preceded by another smooth quadratic curve or a quadratic curve, 
            // then we draw a reflected double stalked control point
            if (prevSegment !== null && (prevSegment.command === 'quadratic curveto' || prevSegment.command === 'smooth quadratic curveto')) {
                controlPoints.push({
                    type: _that.REFLECTED_CP,
                    x: segment.x0 + (prevSegment.x1 - prevSegment.x0),
                    y: segment.y + (prevSegment.y0 - prevSegment.y1),
                    segmentIndex: segmentIndex,
                    fires: true
                });
                controlPoints.push({
                    type: _that.REFLECTED_STALK,
                    subtype: 'x1y1refleft',
                    xfrom: segment.x0 + (prevSegment.x1 - prevSegment.x0),
                    yfrom: segment.y + (prevSegment.y0 - prevSegment.y1),
                    xto: segment.x0,
                    yto: segment.y0,
                    segmentIndex: segmentIndex,
                    fires: false
                });
                controlPoints.push({
                    type: _that.REFLECTED_STALK,
                    subtype: 'x1y1refright',
                    xfrom: segment.x0 + (prevSegment.x1 - prevSegment.x0),
                    yfrom: segment.y + (prevSegment.y0 - prevSegment.y1),
                    xto: segment.x,
                    yto: segment.y,
                    segmentIndex: segmentIndex,
                    fires: false
                });
            }
            // Otherwise, no control point is drawn as you'll just get lines
        }

        if (segment.command === 'elliptical arc') {
            // flip the points if the arc has the first point behind the second
            var leftPoint = {};
            var rightPoint = {};
            if (segment.x0 <= segment.x) {
                leftPoint = {x: segment.x0, y: segment.y0};
                rightPoint = {x: segment.x, y: segment.y};
            } else {
                leftPoint = {x: segment.x, y: segment.y};
                rightPoint = {x: segment.x0, y: segment.y0};
            }

            // we draw a stalked controlpoint for the rx to the left of the left point
            controlPoints.push({
                type: _that.ARC_RX_CP,
                x: leftPoint.x - segment.rx,
                y: leftPoint.y,
                segmentIndex: segmentIndex,
                fires: true
            });
            controlPoints.push({
                type: _that.STALK,
                subtype: 'rx',
                xfrom: leftPoint.x - segment.rx,
                yfrom: leftPoint.y,
                xto: leftPoint.x,
                yto: leftPoint.y,
                segmentIndex: segmentIndex,
                fires: false
            });

            // we draw a stalked controlpoint for the ry above the left point
            controlPoints.push({
                type: _that.ARC_RY_CP,
                x: leftPoint.x,
                y: leftPoint.y - segment.ry,
                segmentIndex: segmentIndex,
                fires: true
            });
            controlPoints.push({
                type: _that.STALK,
                subtype: 'ry',
                xfrom: leftPoint.x,
                yfrom: leftPoint.y - segment.ry,
                xto: leftPoint.x,
                yto: leftPoint.y,
                segmentIndex: segmentIndex,
                fires: false
            });

            // We draw a rotation handle coming out of the left point
            controlPoints.push({
                type: _that.ARC_ROTATION_CP,
                x: leftPoint.x + 10 + segment.xAxisRotation,
                y: leftPoint.y,
                segmentIndex: segmentIndex,
                fires: true
            });
            controlPoints.push({
                type: _that.STALK,
                subtype: 'rot',
                xfrom: leftPoint.x,
                yfrom: leftPoint.y,
                xto: leftPoint.x + 10 + segment.xAxisRotation,
                yto: leftPoint.y,
                segmentIndex: segmentIndex,
                fires: false
            });

            // We draw all the arc combinations and hide the one that is currently chosen
            controlPoints.push({
                type: _that.ARC_HELPER_PATH,
                subtype: 'largesweep',
                pathstring: _that.getArcHelperPath(leftPoint, rightPoint, true, true, segment.rx, segment.ry, segment.xAxisRotation),
                currentlySelected: segment.largeArc === true && segment.sweep === true,
                segmentIndex: segmentIndex,
                fires: true
            });
            controlPoints.push({
                type: _that.ARC_HELPER_PATH,
                subtype: 'largenosweep',
                pathstring: _that.getArcHelperPath(leftPoint, rightPoint, true, false, segment.rx, segment.ry, segment.xAxisRotation),
                currentlySelected: segment.largeArc === true && segment.sweep === false,
                segmentIndex: segmentIndex,
                fires: true
            });
            controlPoints.push({
                type: _that.ARC_HELPER_PATH,
                subtype: 'smallnosweep',
                pathstring: _that.getArcHelperPath(leftPoint, rightPoint, false, false, segment.rx, segment.ry, segment.xAxisRotation),
                currentlySelected: segment.largeArc === false && segment.sweep === false,
                segmentIndex: segmentIndex,
                fires: true
            });
            controlPoints.push({
                type: _that.ARC_HELPER_PATH,
                subtype: 'smallsweep',
                pathstring: _that.getArcHelperPath(leftPoint, rightPoint, false, true, segment.rx, segment.ry, segment.xAxisRotation),
                currentlySelected: segment.largeArc === false && segment.sweep === true,
                segmentIndex: segmentIndex,
                fires: true
            });
        }

        prevSegment = segment;
        segmentIndex += 1;
    });

    // Set the ids
    controlPoints.forEach(function(controlPoint) {
        controlPoint.cpid = _that.getPathSelectionControlId(controlPoint);
    });

    return controlPoints;
  }

  getArcHelperPath(leftPoint, rightPoint, largeArc, sweep, rx, ry, rotation) {
    return "M" + leftPoint.x + " " + leftPoint.y + 
        " A " + rx + " " + ry + " " + rotation + " " +
        (true === largeArc ? "1" : "0") + " " + (true === sweep ? "1" : "0") +
        " " + rightPoint.x + " " + rightPoint.y;
  }

  getPathSelectionControlId(pathSelectionControlInfo) {
    return 'seg-' + pathSelectionControlInfo.segmentIndex +
        (pathSelectionControlInfo['subtype'] !== undefined ? ('sub-' + pathSelectionControlInfo.subtype) : '') +
        '-type-' + pathSelectionControlInfo.type;
  }

  /**
   * Chops the path up into segments. 
   * We follow the naming of the segment fields of https://www.w3.org/TR/SVG/paths.html
   * So a curve C gets translated to {cmd: 'curveto', relative: false, x: .., y: .., x1: .., y1: .., etc}
   * This means x y represent the end point of the segment.
   * We always add an x0, y0 which is the startpoint of the segment (the endpoint of the previous segment)
   * 
   * Remark: coordinate repetitions are not taken into account yet. E.g. L x y x y x y
   * TODO: did I test out all relative commands? + paths that have ..z M..?
   * 
   * @returns A list of path segment commands
   */
  getEnrichedPathArray() {
    let bbox = this.bbox

    var enrichedPathArray = this.el.array().valueOf().map(function(segment) {
        var segmentObject = {
            code: segment[0],
            relative: segment[0].toUpperCase() !== segment[0]
        };

        switch (segment[0]) {
            case 'M': 
            case 'm': {
                segmentObject.command = 'moveto';
                segmentObject.x = segment[1] - bbox.x;
                segmentObject.y = segment[2] - bbox.y;
                break;
            }
            case 'L': 
            case 'l': {
                segmentObject.command = 'lineto';
                segmentObject.x = segment[1] - bbox.x;
                segmentObject.y = segment[2] - bbox.y;
                break;
            }
            case 'H': 
            case 'h': {
                segmentObject.command = 'horizontal lineto';
                segmentObject.x = segment[1] - bbox.x;
                break;
            }
            case 'V': 
            case 'v': {
                segmentObject.segment = 'vertical lineto';
                segmentObject.y = segment[1] - bbox.y;
                break;
            }
            case 'C': 
            case 'c': {
                segmentObject.command = 'curveto';
                segmentObject.x1 = segment[1] - bbox.x;
                segmentObject.y1 = segment[2] - bbox.y;
                segmentObject.x2 = segment[3] - bbox.x;
                segmentObject.y2 = segment[4] - bbox.y;
                segmentObject.x = segment[5] - bbox.x;
                segmentObject.y = segment[6] - bbox.y;
                break;
            }
            case 'S': 
            case 's': {
                segmentObject.command = 'smooth curveto';
                segmentObject.x2 = segment[1] - bbox.x;
                segmentObject.y2 = segment[2] - bbox.y;
                segmentObject.x = segment[3] - bbox.x;
                segmentObject.y = segment[4] - bbox.y;
                break;
            }
            case 'Q': 
            case 'q': {
                segmentObject.command = 'quadratic curveto';
                segmentObject.x1 = segment[1] - bbox.x;
                segmentObject.y1 = segment[2] - bbox.y;
                segmentObject.x = segment[3] - bbox.x;
                segmentObject.y = segment[4] - bbox.y;
                break;
            }
            case 'T': 
            case 't': {
                segmentObject.command = 'smooth quadratic curveto';
                segmentObject.x = segment[1] - bbox.x;
                segmentObject.y = segment[2] - bbox.y;
                break;
            }
            case 'A': 
            case 'a': {
                segmentObject.command = 'elliptical arc';
                segmentObject.rx = segment[1];
                segmentObject.ry = segment[2];
                segmentObject.xAxisRotation = segment[3];
                segmentObject.largeArc = segment[4] === 1;
                segmentObject.sweep = segment[5] === 1;
                segmentObject.x = segment[6] - bbox.x;
                segmentObject.y = segment[7] - bbox.y;
                break;
            }
            case 'Z': 
            case 'z': {
                segmentObject.command = 'closepath';
                break;
            }
        }

        return segmentObject;
    })

    let subpathStart;
    let prevSegmentEnd = {
        x: 0,
        y: 0
    };

    // Make sure every segment has an x0/y0
    enrichedPathArray = enrichedPathArray.map(function(cmd) {
        if (cmd.command === 'moveto') {
            subpathStart = cmd;
        }

        cmd.x0 = prevSegmentEnd.x;
        cmd.y0 = prevSegmentEnd.y;
    
        // Make V/v store its x
        if (!('x' in cmd)) {
            cmd.x = prevSegmentEnd.x;
        }
        // Make H/h store its y
        if (!('y' in cmd)) {
            cmd.y = prevSegmentEnd.y;
        }

        // Even give the closepath an x/y
        if (cmd.command === 'closepath') {
            cmd.x = subpathStart.x;
            cmd.y = subpathStart.y;
        }

        prevSegmentEnd = cmd;

        return cmd;
    });

    return enrichedPathArray;
  }

  drawPathSelectionControl(pathSelectionControlInfo) {
    switch (pathSelectionControlInfo.type) {
        case this.XY_CP:
            return this.drawPathSelectionPoint(pathSelectionControlInfo.x, pathSelectionControlInfo.y).addClass('svg_pathselect_control_point');
        case this.X1Y1_CP:
            return this.drawPathSelectionHandle(pathSelectionControlInfo.x1, pathSelectionControlInfo.y1).addClass('svg_pathselect_control_handle');
        case this.X2Y2_CP:
            return this.drawPathSelectionHandle(pathSelectionControlInfo.x2, pathSelectionControlInfo.y2).addClass('svg_pathselect_control_handle');
        case this.STALK:
            return this.drawPathSelectionStalk(pathSelectionControlInfo.xfrom, pathSelectionControlInfo.yfrom, pathSelectionControlInfo.xto, pathSelectionControlInfo.yto).addClass('svg_pathselect_control_stalk').back();
        case this.REFLECTED_CP:
            return this.drawPathSelectionHandle(pathSelectionControlInfo.x, pathSelectionControlInfo.y).addClass('svg_pathselect_control_handle').addClass('reflected');
        case this.REFLECTED_STALK:
            return this.drawPathSelectionStalk(pathSelectionControlInfo.xfrom, pathSelectionControlInfo.yfrom, pathSelectionControlInfo.xto, pathSelectionControlInfo.yto).addClass('svg_pathselect_control_stalk').addClass('reflected').back();
        case this.ARC_HELPER_PATH:
            return this.drawPathSelectionArcHelperPath(pathSelectionControlInfo.pathstring).addClass('svg_pathselect_arc_helperpath');
        case this.ARC_RX_CP:
        case this.ARC_RY_CP:
            return this.drawPathSelectionHandle(pathSelectionControlInfo.x, pathSelectionControlInfo.y).addClass('svg_pathselect_control_handle');
        case this.ARC_ROTATION_CP:
            return this.drawPathSelectionHandle(pathSelectionControlInfo.x, pathSelectionControlInfo.y).addClass('svg_pathselect_control_handle');
        default:
            throw new Error('Unknown control point type ' + pathSelectionControlInfo.type);
    }
  }

  drawPathSelectionArcHelperPath(pathstring) {
    return this.selection.path(pathstring).fill('none');
  }

  drawPathSelectionHandle(cx, cy) {
    return this.selection.circle(5).center(cx, cy);
  }

  drawPathSelectionPoint(cx, cy) {
    return this.selection.rect(5, 5).center(cx, cy);
  }

  drawPathSelectionStalk(xfrom, yfrom, xto, yto) {
    return this.selection.line(xfrom, yfrom, xto, yto);
  }

// every time a path point is moved, we have to update the positions of our point
updatePathPointSelection() {
    let cparray = this.getPathControlPoints();

    let _that = this
    this.selection.list.each(function (i) {
        // Retrieve the control-point-id from the node
        let cpid = this.attr('cpid');

        // Look up the corresponding control point info in our array
        let controlPointInfo = cparray.find(function(cp) {
            return cp.cpid === cpid;
        });

        switch(controlPointInfo.type) {
            case _that.XY_CP:
            case _that.REFLECTED_CP:
                this.center(controlPointInfo.x, controlPointInfo.y);
                break;
            case _that.X1Y1_CP:
                this.center(controlPointInfo.x1, controlPointInfo.y1);
                break;
            case _that.X2Y2_CP:
                this.center(controlPointInfo.x2, controlPointInfo.y2);
                break;
            case _that.STALK:
            case _that.REFLECTED_STALK:
                this.attr('x1', controlPointInfo.xfrom);
                this.attr('y1', controlPointInfo.yfrom);
                this.attr('x2', controlPointInfo.xto);
                this.attr('y2', controlPointInfo.yto);
                break;
            case _that.ARC_RX_CP:
            case _that.ARC_RY_CP:
                this.center(controlPointInfo.x, controlPointInfo.y);
                break;
            case _that.ARC_ROTATION_CP:
                this.center(controlPointInfo.x, controlPointInfo.y);
                break;
            case _that.ARC_HELPER_PATH:
                this.plot(controlPointInfo.pathstring); // TODO: do we need to reattach the css class for this?
                break;
        }
    });
  }

  mutationHandler() {
    this.updatePathPointSelection();
  }
}
