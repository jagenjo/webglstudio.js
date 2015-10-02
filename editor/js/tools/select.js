//this tool is always on, it changes the selected item when clicked
var selectTool = {
	name: "select",
	description: "Select a node",
	section: "select",
	icon: "imgs/mini-icon-cursor.png",
	keyShortcut: 81, //Q

	enabled: false,

	click_time: 200, //ms
	click_dist: 50, //in pixels (to avoid interpreting dragging as a fast click)
	click_pos: [0,0],

	onRegister: function()
	{
		RenderModule.viewport3d.addModule(this);
	},

	mousedown: function(e) {
		this.click_pos = [e.canvasx,e.canvasy];

		/* if done here then we cannot use the right mouse for camera panning
		if(e.button == 2)
		{
			var instance_info = LS.Picking.getInstanceAtCanvasPosition( e.canvasx, e.canvasy, ToolUtils.getCamera() );
			if(instance_info)
			{
				EditorModule.showContextualNodeMenu( instance_info.constructor === LS.SceneNode ? instance_info : instance_info.instance, e );
				e.preventDefault();
				e.stopPropagation();
				return true;
			}
		}
		*/
	},

	mousemove: function(e) {

		/*		
		//test raycast
		var camera = ToolUtils.getCamera();
		var ray = camera.getRayInPixel( e.mousex, gl.canvas.height - e.mousey );
		ray.end = vec3.add( vec3.create(), ray.start, vec3.scale(vec3.create(), ray.direction, 10000) );
		var collisions = Physics.raycast(Scene, ray.start, ray.end);

		if(collisions.length)
			EditorView.debug_points.push( collisions[0][1] );
		*/
	},

	mouseup: function(e) {
		//if(!this.enabled) return;

		e.preventDefault();
		e.stopPropagation();

		var now = new Date().getTime();
		var dist = Math.sqrt( (e.canvasx - this.click_pos[0])<<2 + (e.canvasy - this.click_pos[1])<<2 );
		if (e.click_time < this.click_time && dist < this.click_dist) //fast click
		{
			var instance_info = LS.Picking.getInstanceAtCanvasPosition( e.canvasx, e.canvasy, ToolUtils.getCamera() );
			if(!instance_info)
				return false;

			if(e.button == 2)
			{
				EditorModule.showContextualNodeMenu( instance_info.constructor === LS.SceneNode ? instance_info : instance_info.instance, e );
				return true;
			}
			else if(e.shiftKey)
			{
				if( SelectionModule.isSelected( instance_info ) )
					SelectionModule.removeFromSelection( instance_info );
				else
					SelectionModule.addToSelection( instance_info );
			}
			else
				SelectionModule.setSelection( instance_info );

			//console.log("found: ", instance_info );
		}

		return false;
	}
};

ToolsModule.registerTool({ name: "select", display: false, module: selectTool });

