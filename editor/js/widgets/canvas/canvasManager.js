// This creates the WebGL context and allows some ierarchical structure so several elements could access the canvas
// It is created from RenderModule and all the modules that want to render something in the canvas must register here

function CanvasManager( container, options)
{
	this.widgets = [];
	this.keys = {};

	this.pause_render = false;

	this.root = new CanvasElement();
	this.root.use_normalized_viewport = 1;
	this.root.size = [1,1];

	this.init( container, options )
}

CanvasManager.prototype.init = function( options )
{
	options = options || {};

	var container = options.container || "body";

	if(container.constructor === String)
	{
		container = document.querySelector( container );
		if(!container)
			return false;
	}

	if( options.full )
	{
		options.width = container.offsetWidth; 
		options.height = container.offsetHeight;
	}

	options.width = options.width || 500;
	options.height = options.height || 500;

	var antialiasing = true;
	if(options.antialiasing != null)
		antialiasing = options.antialiasing;

	//setting this var to true will make the render slower but allow to call toDataURL
	var allow_read = false;

	//create canvas and attach events
	try
	{
		window.gl = GL.create({ antialias: antialiasing, alpha:false, stencil: true, premultipliedAlpha: false, debug: true, preserveDrawingBuffer: allow_read });
	}
	catch (err)
	{
		console.error("WebGL not supported");
		return false;
	}

	if(options.subsampling && options.subsampling != 1 )
	{
		gl.canvas.width = options.width / options.subsampling;
		gl.canvas.height = options.height / options.subsampling;
		gl.canvas.style.width = options.width.toFixed() + "px";
		gl.canvas.style.height = options.height.toFixed() + "px";
	}
	else
	{
		gl.canvas.width = options.width;
		gl.canvas.height = options.height;
	}

	var that = this;

	gl.ondraw = this.ondraw.bind(this);
	gl.onupdate = this.onupdate.bind(this);

	gl.captureMouse(true,true);
	gl.captureKeys();
	gl.captureGamepads();

	//assign all event catchers
	gl.onmousedown = 
		gl.onmousemove = 
		gl.onmouseup = 
		gl.onkeydown = 
		gl.onkeyup = 
		gl.onmousewheel = 
		gl.ongamepadconnected = 
		gl.ongamepaddisconnected = 
		gl.ongamepadButtonDown = 
		gl.ongamepadButtonDown = 
		gl.ontouch = 
		gl.ongesture = this.dispatchEvent.bind(this);

	gl.viewport(0,0,gl.canvas.width, gl.canvas.height);
	gl.enable( gl.CULL_FACE );
	gl.enable( gl.DEPTH_TEST );

	//attach
	container.appendChild( gl.canvas );
	window.addEventListener("resize", this.onCheckSize.bind(this), true );
	this.canvas = gl.canvas;
	this.gl = gl;
	gl.animate();
};

CanvasManager.prototype.onCheckSize = function()
{
	this.resize();
}

CanvasManager.prototype.resize = function(w,h)
{
	if(!this.gl || !this.gl.canvas)
		return;

	var parent = this.gl.canvas.parentNode;
	w = w || parent.offsetWidth;
	h = h || parent.offsetHeight;

	if(w == 0 || h == 0) return;
	if(w == this.gl.canvas.width && h == this.gl.canvas.height)
		return;

	this.gl.canvas.width = w;
	this.gl.canvas.height = h;
	this.gl.viewport(0,0,w,h);
}

CanvasManager.prototype.enable = function()
{
	window.gl = this.gl;
}

//Adds a widget inside the canvas, the priority is a number used to sort the widgets
//higher number means it renders the last one but receives the events first, default is 0
CanvasManager.prototype.addWidget = function( widget, priority )
{
	priority = priority || 0;
	widget.canvas_priority = priority;
	this.widgets.push(widget);
	//sort by priority
	this.widgets.sort( function(a,b) { return a.canvas_priority - b.canvas_priority; } );
},

CanvasManager.prototype.removeWidget = function(widget)
{
	var pos = this.widgets.indexOf(widget);
	if(pos != -1)
		this.widgets.splice(pos,1);
},

//Be careful, events are processed from end to start, so lower order means later
CanvasManager.prototype.setWidgetOrder = function(widget, order)
{
	var pos = this.widgets.indexOf(widget);
	if(pos == order)
		return;

	this.widgets.splice(pos,1); //remove
	if(order < 0)
		this.widgets.splice(0,0,widget);
	else if(order >= this.widgets.length)
		this.widgets.push(widget);
	else
		this.widgets.splice(order,0,widget);
},


CanvasManager.prototype.ondraw = function()
{
	if(this.pause_render)
		return;

	this.frame_rendered = false;
	var force_frame = this.must_update;

	//widgets are independent elemnts that require rendering (like EditorView)
	for(var i = 0; i < this.widgets.length; ++i)
	{
		if(this.widgets[i].render)
			if(this.widgets[i].render(gl, force_frame) == true)
				break;
	}

	this.must_update = false;

	if(!this.frame_rendered)
		return;

	//render 2D tree
	gl.start2D();
	CanvasElement.reset( gl.viewport_data );
	this.root.render( gl );
	gl.finish2D();
},

CanvasManager.prototype.onupdate = function(seconds)
{
	for(var i = 0; i < this.widgets.length; ++i)
	{
		if(this.widgets[i].update)
			this.widgets[i].update(seconds);
	}

	this.root.update( seconds );
}

CanvasManager.prototype.dispatchEvent = function(e)
{
	var event_name = e.eventType;

	if(event_name == "mousedown")
	{
		LiteGUI.focus_widget = this.canvas;
		var elem = document.activeElement;
		if(elem && elem.blur)
			elem.blur();
	}

	//start width widgets
	if( this.root.processEvent(e) === true )
	{
		this.refresh();
		return;
	}

	//back to front
	for(var i = this.widgets.length-1;i >= 0; i--)
	{
		if(this.widgets[i].onevent)
			if(this.widgets[i].onevent(e) === true)
				break;

		if(this.widgets[i][event_name])
			if(this.widgets[i][event_name].call(this.widgets[i],e) === true)
				break;
	}
}

CanvasManager.prototype.refresh = function()
{
	this.must_update = true;
}


