# Graphs

WebGLStudio allows to use graphs to control the behaviour or to connect properties of different components.

This makes it easier than coding and less prone to errors, but it is also very limited.

Using graphs we can assign values to properties of our scene just by dragging wires.

Values could come from other properties on the scene or by more complex computations (using random, trigonometry, math operations, etc). 

It is very handy when you just want to ensure two properties have the same value (or a value related to each other). For instance, when we move one scene node there is another that updates its Y position to match the one on the first node.

# Usage

To use graphs in our scene first you need to create a GraphComponent in any of the nodes in our scene.

There are different Graph component clases depending if the graph is for behaviour or for rendering (```GraphComponent```, ```FXGraphComponent```).

Also you can choose when a graph is executed (before rendering, after rendering, during the update, on startup, on trigger etc).

To edit a graph click the ```Edit Graph``` button in the component, this will bring the graph editor view.

Once the graph is visible there are different ways to create nodes.

Right-clicking in the canvas will show the menu to add a new node, there are lots of nodes sorted by categories. Select any of them and it will appear in the canvas.

If what we want is bring any property from our scene to the canvas, just drag the component or property from the inspector into the canvas.

To drag components you must drag the component icon next to the name in the inspector.

To drag properties you must drag the ball icon next to the name of the property.

Once you drag them into the canvas a new GraphNode will appear in the canvas.

GraphNodes have inputs and outputs by default, but you can add new input/outputs right-clicking in the node and choosing from the inputs outputs menu. It depends in the node itself.

When you want to connect the values between two nodes, you just drag the output slot of the node to the input slot of the other node.

To break a connection just click in the input node connection.

To edit the properties of any node double-click on it and check the inspector info.

## Documentation

To know more about graph check the [LiteGraph documentation](https://github.com/jagenjo/litegraph.js).





