var dragNodeTool = {
	name: "drag",
	description: "Drag node to inspector",
	section: "foo",
	icon: "imgs/mini-icon-cursor.png",

	state: null,

	mouse_pos: vec3.create(),

	onEnable: function()
	{
		gl.canvas.draggable = true;
		gl.ignore_events = true;	
		gl.canvas.ondragstart = this.dragstart.bind(this);
		gl.canvas.ondrop = this.drop.bind(this);
	},

	onDisable: function()
	{
		gl.canvas.draggable = false;
		gl.ignore_events = false;	
		gl.canvas.ondragstart = null;
	},

	renderEditor: function(camera)
	{
	},

	mousedown: function(e)
	{
		this.mouse_pos.set([e.canvasx, e.canvasy, 0]);
		this.state = "dragging";
		gl.ignore_events = true;	
		e.skip_preventDefault = true;
		return true;
	},

	mousemove: function(e)
	{
		e.skip_preventDefault = true;
		return true;
	},

	dragstart: function(e)
	{
		console.log("DRAGSTART");

		GL.augmentEvent( e );
		var img = new Image();
		img.src = "imgs/mini-icon-ball.png";
		e.dataTransfer.setDragImage( img, 0, 0 );

		if (e.buttons != LS.Input.BUTTONS_LEFT) //left
			return;

		var instance_info = LS.Picking.getInstanceAtCanvasPosition( e.canvasx, e.canvasy, ToolUtils.getCamera() );
		if(!instance_info)
			return;

		var node = null;

		if( instance_info.constructor == LS.SceneNode )
			node = instance_info;
		else
		{
			if( instance_info.instance )
			{
				if( instance_info.instance.constructor == LS.SceneNode )
					node = instance_info.instance;
				else if( instance_info.instance.constructor.is_component)
					node = instance_info.instance._root;
			}
		}
			
		if( !node )
			return;

		var id = e.ctrlKey ? node.name : node.uid;
		e.dataTransfer.setData( "uid", node.uid );
		e.dataTransfer.setData( "class", "SceneNode" );
		e.dataTransfer.setData( "node_uid", id );

		return true;
	},

	drop: function(e)
	{
		console.log("DROP");
		e.stopPropagation();
		return true;
	}
};

ToolsModule.registerTool( dragNodeTool );

