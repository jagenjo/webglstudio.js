//Like an HTMLElement but to render inside the WebGLCanvas (or Canvas2D)
//Used for GUI elements that must be 3D

function CanvasElement()
{
	this._ctor();
}

CanvasElement.global_viewport = vec4.fromValues(0,0,800,600);
CanvasElement.viewport_stack = new Float32Array( 4 * 32 );
CanvasElement.viewport_stack_top = 0;

CanvasElement.TOP_LEFT = 0;
CanvasElement.TOP_RIGHT = 1;
CanvasElement.BOTTOM_LEFT = 2;
CanvasElement.BOTTOM_RIGHT = 3;

CanvasElement.prototype._ctor = function( ctx )
{
	this.visible = true;

	this.border = false;
	this.draggable = false;
	this.resizable = false;
	this.closable = false;
	this.use_scissor_test = false;
	this.use_normalized_viewport = false;

	//where to put it
	this._anchor = CanvasElement.TOP_LEFT;
	this._viewport = vec4.fromValues(0,0,100,100);
	this._position = this._viewport.subarray(0,2);
	this._size = this._viewport.subarray(2,4);
	this._last_viewport = vec4.fromValues(0,0,100,100); //in viewport coordinates

	this.parentNode = null;
	this.children = [];
}

Object.defineProperty( CanvasElement.prototype, "position", {
	set: function(v){
		return this._position.set(v);
	},
	get: function()
	{
		return this._position;
	},
	enumerable: true
});

Object.defineProperty( CanvasElement.prototype, "size", {
	set: function(v){
		return this._size.set(v);
	},
	get: function()
	{
		return this._size;
	},
	enumerable: true
});

Object.defineProperty( CanvasElement.prototype, "viewport", {
	set: function(v){
		return this._viewport.set(v);
	},
	get: function()
	{
		return this._viewport;
	},
	enumerable: true
});

//if this returns true the render stops 
CanvasElement.prototype.render = function( ctx )
{
	CanvasElement.pushViewport();
	this.assignViewport();

	var v = this._last_viewport;

	if(this.onRender)
		this.onRender( ctx, v );

	if(this.border)
	{
		ctx.strokeStyle = "#445";
		ctx.strokeRect( v[0] - 0.5, v[1] - 0.5, v[2], v[3] );

		if(this.closable)
		{
			ctx.fillStyle = "black";
			ctx.fillRect( v[0] - 20.5 + v[2], v[1] - 0.5, 20, 20 );
			ctx.strokeStyle = "white";
			ctx.beginPath();
			ctx.moveTo(v[0] + v[2] - 18, v[1] + 2);
			ctx.lineTo(v[0] + v[2] - 2, v[1] + 18);
			ctx.moveTo(v[0] + v[2] - 2, v[1] + 2);
			ctx.lineTo(v[0] + v[2] - 18, v[1] + 18);
			ctx.stroke();
		}
	}

	for(var i = 0; i < this.children.length; ++i)
		this.children[i].render( ctx );

	CanvasElement.popViewport();
}

CanvasElement.prototype.update = function(dt)
{
	if(this.onUpdate)
		this.onUpdate(dt);

	for(var i = 0; i < this.children.length; ++i)
		this.children[i].update(dt);
}

CanvasElement.prototype.addChild = function( element )
{
	if(!element)
		throw("CanvasElement cannot be null ");
	//if(element.constructor !== CanvasElement)
	//	throw("child must be CanvasElement");
	if(element.parentNode)
		throw("CanvasElement already has parent");
	element.parentNode = this;
	this.children.push( element );
}

CanvasElement.prototype.removeChild = function( element )
{
	if(element.parentNode !== this)
		throw("CanvasElement is not children");
	var index = this.children.indexOf( element );
	if(index == -1)
		throw("CanvasElement is not children");
	this.children.splice( index, 1 );
	element.parentNode = null;
}

CanvasElement.prototype.close = function()
{
	if( !this.parentNode )
		return;
	if(this.onClose)
		if( this.onClose() === true )
			return;
	this.parentNode.removeChild( this );
	this.parentNode = null;
}


CanvasElement.prototype.processEvent = function(e)
{
	if(this.onEvent)
	{
		if( this.onEvent(e) === true )
			return true;
	}

	for(var i = this.children.length-1; i >= 0; --i)
		if( this.children[i].processEvent( e ) === true )
			return true;

	if(this.draggable)
	{
		var v = this._last_viewport;
		var inside = CanvasElement.isEventInsideRectangle( e, v, 2 );

		if( e.type == "mousedown" && inside )
		{
			if( this.closable && CanvasElement.distanceEventToPoint( e, v[0] + v[2], v[1] ) < 20)
			{
				this.close();
				return true;
			}
			if( this.resizable && CanvasElement.distanceEventToPoint( e, v[0] + v[2], v[1] + v[3] ) < 10 )
				this._resizing = true;
			else
				this._dragging = true;
			return true;
		}
		else if(e.type == "mousemove")
		{
			if( this._resizing )
			{
				this.size[0] += e.deltax;
				this.size[1] += e.deltay;
				return true;
			}
			else if( this._dragging)
			{
				this.position[0] += e.deltax;
				this.position[1] += e.deltay;
				return true;
			}
		}
		else if(e.type == "mouseup")
		{
			this._dragging = false;
			this._resizing = false;
			//return true;
		}
	}
}

CanvasElement.prototype.isEventInside = function( e, margin )
{
	return CanvasElement.isEventInsideRectangle( e, this._last_viewport, margin);
}

CanvasElement.distanceEventToPoint = function(e,x,y)
{
	return Math.sqrt( (x - e.mousex)*(x - e.mousex) + (y - e.mousey) * (y - e.mousey) );
}

CanvasElement.isEventInsideRectangle = function(e, rect, margin)
{
	margin = margin || 0;
	var x = e.mousex;	
	var y = e.mousey;
	if(	x > (rect[0] - margin) &&
		y > (rect[1] - margin) &&
		x < (rect[0] + rect[2] + margin) &&
		y < (rect[1] + rect[3] + margin) )
		return true;
	return false;
}


//CanvasElement.prototype.addEventListener
//CanvasElement.prototype.dispatchEvent

CanvasElement.prototype.assignViewport = function()
{
	if(this.use_normalized_viewport)
	{
		this._last_viewport[0] = CanvasElement.global_viewport[0] + this._viewport[0] * CanvasElement.global_viewport[2];
		this._last_viewport[1] = CanvasElement.global_viewport[1] + this._viewport[1] * CanvasElement.global_viewport[3];
		this._last_viewport[2] = this._viewport[2] * CanvasElement.global_viewport[2];
		this._last_viewport[3] = this._viewport[3] * CanvasElement.global_viewport[3];
	}
	else
	{
		this._last_viewport[0] = CanvasElement.global_viewport[0] + this._viewport[0];
		this._last_viewport[1] = CanvasElement.global_viewport[1] + this._viewport[1];
		this._last_viewport[2] = this._viewport[2];
		this._last_viewport[3] = this._viewport[3];
	}

	CanvasElement.global_viewport.set( this._last_viewport );
}

CanvasElement.pushViewport = function()
{
	if( CanvasElement.viewport_stack_top == 32 )
		throw("Too many pushes in the CanvasElement stack");
	CanvasElement.viewport_stack.set( CanvasElement.global_viewport, CanvasElement.viewport_stack_top * 4 );
	CanvasElement.viewport_stack_top++;
}

CanvasElement.popViewport = function()
{
	if( CanvasElement.viewport_stack_top == 0 )
		throw("Too many pops in the CanvasElement stack");
	CanvasElement.viewport_stack_top--;
	CanvasElement.global_viewport.set( CanvasElement.viewport_stack.subarray( CanvasElement.viewport_stack_top * 4, CanvasElement.viewport_stack_top * 4 + 4 ) );
}

CanvasElement.reset = function(viewport)
{
	if(viewport)
		CanvasElement.global_viewport.set( viewport );
	CanvasElement.viewport_stack_top = 0;
}
